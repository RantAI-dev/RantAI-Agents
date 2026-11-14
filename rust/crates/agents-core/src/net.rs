//! Addresses: which ones are on the public internet, CIDR ranges, and the one rule for the
//! caller's IP behind proxies.
//!
//! Pure: the caller resolves names and reads the socket; this only decides.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// Whether `ip` is a public unicast address: not loopback, private, link-local, CGNAT,
/// unique-local, multicast, documentation or otherwise reserved. The cloud metadata services
/// (169.254.169.254, fd00:ec2::254) fall in link-local and unique-local.
///
/// An IPv4 address carried in IPv6 (mapped, compatible, NAT64, 6to4) is judged as the IPv4 one,
/// or `::ffff:127.0.0.1` would pass.
#[must_use]
pub fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => is_public_v6(v6),
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(a == 0                                     // "this network"
        || a == 10                               // private
        || a == 127                              // loopback
        || (a == 100 && (64..128).contains(&b))  // CGNAT 100.64.0.0/10
        || (a == 169 && b == 254)                // link-local, cloud metadata
        || (a == 172 && (16..32).contains(&b))   // private
        || (a == 192 && b == 0 && c == 0)        // IETF protocol assignments
        || (a == 192 && b == 0 && c == 2)        // documentation
        || (a == 192 && b == 88 && c == 99)      // 6to4 relay anycast
        || (a == 192 && b == 168)                // private
        || (a == 198 && (b == 18 || b == 19))    // benchmarking
        || (a == 198 && b == 51 && c == 100)     // documentation
        || (a == 203 && b == 0 && c == 113)      // documentation
        || a >= 224) // multicast, reserved, broadcast
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = embedded_v4(ip) {
        return is_public_v4(v4);
    }
    let s = ip.segments();
    let first = s.first().copied().unwrap_or(0);
    !(ip.is_unspecified()
        || ip.is_loopback()
        || (first & 0xfe00) == 0xfc00          // unique-local fc00::/7 (fd00:ec2::254)
        || (first & 0xffc0) == 0xfe80          // link-local fe80::/10
        || (first & 0xffc0) == 0xfec0          // site-local fec0::/10 (deprecated)
        || (first & 0xff00) == 0xff00          // multicast
        || first == 0x0100 && s.get(1..4) == Some(&[0, 0, 0]) // discard 100::/64
        || (first == 0x2001 && s.get(1) == Some(&0x0db8)) // documentation
        || (first == 0x2001 && s.get(1).is_some_and(|x| *x < 0x0200)) // IETF 2001::/23
        || first == 0) // the rest of ::/16: IPv4-compatible and reserved
}

/// The IPv4 address an IPv6 one carries: mapped `::ffff:a.b.c.d`, NAT64 `64:ff9b::a.b.c.d`
/// and 6to4 `2002:aabb:ccdd::`.
fn embedded_v4(ip: Ipv6Addr) -> Option<Ipv4Addr> {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return Some(v4);
    }
    let s = ip.segments();
    let [s0, s1, s2, s3, s4, s5, s6, s7] = s;
    let from = |hi: u16, lo: u16| {
        let [a, b] = hi.to_be_bytes();
        let [c, d] = lo.to_be_bytes();
        Ipv4Addr::new(a, b, c, d)
    };
    if s0 == 0x0064 && s1 == 0xff9b && s2 == 0 && s3 == 0 && s4 == 0 && s5 == 0 {
        return Some(from(s6, s7));
    }
    if s0 == 0x2002 {
        return Some(from(s1, s2));
    }
    None
}

/// An address range such as `10.0.0.0/8` or `fd00::/8`. A bare address is a range of one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cidr {
    network: IpAddr,
    prefix: u8,
}

impl Cidr {
    /// Parses `addr` or `addr/prefix`. `None` for anything else, a prefix too long for the
    /// family included.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let text = text.trim();
        let (addr, prefix) = match text.split_once('/') {
            Some((addr, prefix)) => (addr, Some(prefix)),
            None => (text, None),
        };
        let network: IpAddr = addr.parse().ok()?;
        let max = if network.is_ipv4() { 32 } else { 128 };
        let prefix = match prefix {
            Some(p) => p.parse::<u8>().ok().filter(|p| *p <= max)?,
            None => max,
        };
        Some(Self { network, prefix })
    }

    /// Whether `ip` is in the range. An IPv4-mapped IPv6 address is matched as IPv4, which is
    /// how a dual-stack socket reports an IPv4 peer.
    #[must_use]
    pub fn contains(&self, ip: IpAddr) -> bool {
        let ip = canonical(ip);
        match (self.network, ip) {
            (IpAddr::V4(net), IpAddr::V4(ip)) => prefix_eq(
                u128::from(u32::from(net)) << 96,
                u128::from(u32::from(ip)) << 96,
                self.prefix,
            ),
            (IpAddr::V6(net), IpAddr::V6(ip)) => {
                prefix_eq(u128::from(net), u128::from(ip), self.prefix)
            }
            _ => false,
        }
    }
}

fn prefix_eq(a: u128, b: u128, prefix: u8) -> bool {
    if prefix == 0 {
        return true;
    }
    let mask = u128::MAX << (128 - u32::from(prefix.min(128)));
    (a & mask) == (b & mask)
}

/// An IPv4-mapped IPv6 address as the IPv4 one; anything else unchanged.
#[must_use]
pub fn canonical(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map_or(ip, IpAddr::V4),
        IpAddr::V4(_) => ip,
    }
}

/// Parses a comma-separated list of ranges (`TRUSTED_PROXIES`). An empty or blank text is an
/// empty list.
///
/// # Errors
/// The first entry that is not an address or a range.
pub fn parse_cidrs(text: &str) -> Result<Vec<Cidr>, String> {
    text.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| Cidr::parse(s).ok_or_else(|| s.to_owned()))
        .collect()
}

/// The caller's address: the one rule every route uses.
///
/// - The socket peer is the only address nobody can forge. With no trusted proxies it is the
///   answer, and `X-Forwarded-For` and `X-Real-IP` are ignored: a client writes them freely.
/// - When the peer is a trusted proxy, `X-Forwarded-For` is walked from the right (each proxy
///   appends the address it saw), skipping trusted hops; the first untrusted hop is the client.
///   Without `X-Forwarded-For`, a trusted proxy's `X-Real-IP` is used.
/// - An entry that is not an address stops the walk at the last hop that was trusted to write
///   it, so garbage cannot pick the answer.
#[must_use]
pub fn client_ip(
    peer: Option<IpAddr>,
    x_forwarded_for: Option<&str>,
    x_real_ip: Option<&str>,
    trusted: &[Cidr],
) -> Option<IpAddr> {
    let peer = canonical(peer?);
    let is_trusted = |ip: IpAddr| trusted.iter().any(|c| c.contains(ip));
    if !is_trusted(peer) {
        return Some(peer);
    }
    let hops: Vec<&str> = x_forwarded_for
        .map(|v| {
            v.split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();
    if hops.is_empty() {
        return Some(x_real_ip.and_then(|v| parse_hop(v.trim())).unwrap_or(peer));
    }
    let mut current = peer;
    for hop in hops.iter().rev() {
        if !is_trusted(current) {
            break;
        }
        match parse_hop(hop) {
            Some(ip) => current = ip,
            None => break,
        }
    }
    Some(current)
}

/// One hop: an address, an IPv4 address with a port, or a bracketed IPv6 address with one.
fn parse_hop(hop: &str) -> Option<IpAddr> {
    if let Ok(ip) = hop.parse::<IpAddr>() {
        return Some(canonical(ip));
    }
    if let Ok(sock) = hop.parse::<std::net::SocketAddr>() {
        return Some(canonical(sock.ip()));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
    }

    #[test]
    fn private_and_metadata_addresses_are_not_public() {
        for s in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.1.1",
            "169.254.169.254",
            "100.64.0.1",
            "100.127.255.255",
            "0.0.0.0",
            "255.255.255.255",
            "224.0.0.1",
            "::1",
            "::",
            "fd00:ec2::254",
            "fc00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
            "::ffff:169.254.169.254",
            "64:ff9b::a9fe:a9fe",
            "2002:7f00:1::",
            "ff02::1",
        ] {
            assert!(!is_public(ip(s)), "{s} is not public");
        }
        for s in [
            "8.8.8.8",
            "1.1.1.1",
            "100.128.0.1",
            "172.32.0.1",
            "2606:4700::1111",
            "::ffff:8.8.8.8",
        ] {
            assert!(is_public(ip(s)), "{s} is public");
        }
    }

    #[test]
    fn ranges_parse_and_match() {
        let net = Cidr::parse("10.0.0.0/8");
        assert!(net.is_some_and(|c| c.contains(ip("10.9.9.9"))));
        assert!(net.is_some_and(|c| !c.contains(ip("11.0.0.1"))));
        assert!(
            net.is_some_and(|c| c.contains(ip("::ffff:10.0.0.1"))),
            "a mapped peer"
        );
        assert!(Cidr::parse("fd00::/8").is_some_and(|c| c.contains(ip("fd12::1"))));
        assert!(Cidr::parse("1.2.3.4").is_some_and(|c| c.contains(ip("1.2.3.4"))));
        assert!(Cidr::parse("0.0.0.0/0").is_some_and(|c| c.contains(ip("8.8.8.8"))));
        assert_eq!(Cidr::parse("10.0.0.0/33"), None);
        assert_eq!(Cidr::parse("nope"), None);
        assert_eq!(parse_cidrs(""), Ok(Vec::new()));
        assert_eq!(parse_cidrs("10.0.0.0/8, bad"), Err("bad".to_owned()));
    }

    #[test]
    fn without_trusted_proxies_the_headers_are_ignored() {
        let got = client_ip(
            Some(ip("203.0.113.9")),
            Some("1.2.3.4"),
            Some("5.6.7.8"),
            &[],
        );
        assert_eq!(got, Some(ip("203.0.113.9")));
        assert_eq!(client_ip(None, Some("1.2.3.4"), None, &[]), None);
    }

    #[test]
    fn behind_trusted_proxies_the_first_untrusted_hop_from_the_right_wins() -> Result<(), String> {
        let trusted = parse_cidrs("10.0.0.0/8")?;
        // The client wrote 6.6.6.6 itself; the edge proxy appended the real 1.2.3.4.
        let got = client_ip(
            Some(ip("10.0.0.2")),
            Some("6.6.6.6, 1.2.3.4, 10.0.0.5"),
            None,
            &trusted,
        );
        assert_eq!(got, Some(ip("1.2.3.4")));
        // A peer that is not a trusted proxy is the answer whatever it sends.
        let got = client_ip(Some(ip("8.8.8.8")), Some("1.2.3.4"), None, &trusted);
        assert_eq!(got, Some(ip("8.8.8.8")));
        // Every hop trusted: the leftmost one.
        let got = client_ip(Some(ip("10.0.0.2")), Some("10.0.0.9"), None, &trusted);
        assert_eq!(got, Some(ip("10.0.0.9")));
        // Garbage stops the walk at the proxy that wrote it.
        let got = client_ip(Some(ip("10.0.0.2")), Some("1.2.3.4, junk"), None, &trusted);
        assert_eq!(got, Some(ip("10.0.0.2")));
        // A port is tolerated.
        let got = client_ip(Some(ip("10.0.0.2")), Some("1.2.3.4:5555"), None, &trusted);
        assert_eq!(got, Some(ip("1.2.3.4")));
        // No X-Forwarded-For: the proxy's X-Real-IP.
        let got = client_ip(Some(ip("10.0.0.2")), None, Some("1.2.3.4"), &trusted);
        assert_eq!(got, Some(ip("1.2.3.4")));
        Ok(())
    }
}
