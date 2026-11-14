//! A WebSocket client, so the socket tests speak the protocol over a real connection.
//!
//! `axum::extract::ws` is a server; there is no client in the dependency set and this port adds
//! no crate for one. The handshake and the two frames a test needs (a masked text frame out, a
//! text, close or pong frame in) are written here, which also means the tests see the real
//! handshake: the `Authorization` header, the 101, and the close code a client would branch on.

#![allow(dead_code, reason = "the socket tests use parts of it")]

use std::io;
use std::net::SocketAddr;

use axum::Router;
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

/// Serves the router on 127.0.0.1 and returns where it listens.
pub async fn serve(app: Router) -> Result<SocketAddr, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    tokio::spawn(async move {
        let _ = axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await;
    });
    Ok(address)
}

/// What the handshake answered.
pub enum Handshake {
    /// A socket, open.
    Open(Socket),
    /// The server refused the request: the HTTP status.
    Refused(u16),
}

/// Opens a socket at `path`.
pub async fn connect(
    address: SocketAddr,
    path: &str,
    headers: &[(&str, &str)],
) -> Result<Handshake, Box<dyn std::error::Error>> {
    let mut stream = TcpStream::connect(address).await?;
    let mut request = format!(
        "GET {path} HTTP/1.1\r\nHost: {address}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
         Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n"
    );
    for (name, value) in headers {
        request.push_str(&format!("{name}: {value}\r\n"));
    }
    request.push_str("\r\n");
    stream.write_all(request.as_bytes()).await?;
    stream.flush().await?;

    // The response head, and whatever of the first frame arrived with it.
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 1024];
    let head_end = loop {
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            return Err("the server closed before answering the handshake".into());
        }
        buffer.extend_from_slice(chunk.get(..read).unwrap_or_default());
        if let Some(at) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
            break at + 4;
        }
    };
    let head = String::from_utf8_lossy(buffer.get(..head_end).unwrap_or_default()).to_string();
    let status: u16 = head
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .unwrap_or(0);
    if status != 101 {
        return Ok(Handshake::Refused(status));
    }
    Ok(Handshake::Open(Socket {
        stream,
        buffer: buffer.get(head_end..).unwrap_or_default().to_vec(),
    }))
}

/// One frame the server sent.
#[derive(Debug, Clone, PartialEq)]
pub enum Frame {
    Text(Value),
    /// A close frame, with its code (1005 when the server sent none).
    Close(u16),
    Pong,
    /// A frame of a kind these tests do not use, by its opcode.
    Other(u8),
}

/// A socket that can send a text frame and read what comes back.
pub struct Socket {
    stream: TcpStream,
    buffer: Vec<u8>,
}

impl Socket {
    /// Sends one text frame, masked as a client must.
    pub async fn send_text(&mut self, text: &str) -> io::Result<()> {
        let payload = text.as_bytes();
        let mut frame = vec![0x81_u8];
        match payload.len() {
            len if len < 126 => frame.push(0x80 | u8::try_from(len).unwrap_or(0)),
            len if len < 65_536 => {
                frame.push(0x80 | 126);
                frame.extend_from_slice(&u16::try_from(len).unwrap_or(0).to_be_bytes());
            }
            len => {
                frame.push(0x80 | 127);
                frame.extend_from_slice(&u64::try_from(len).unwrap_or(0).to_be_bytes());
            }
        }
        let mask = [0x37_u8, 0xfa, 0x21, 0x3d];
        frame.extend_from_slice(&mask);
        for (index, byte) in payload.iter().enumerate() {
            let key = mask.get(index % mask.len()).copied().unwrap_or(0);
            frame.push(byte ^ key);
        }
        self.stream.write_all(&frame).await?;
        self.stream.flush().await
    }

    /// Sends only the head of a masked text frame that announces `length` bytes, and none of
    /// them: a server that reads the payload before checking its size waits here.
    pub async fn send_frame_head(&mut self, length: u64) -> io::Result<()> {
        let mut head = vec![0x81_u8, 0x80 | 127];
        head.extend_from_slice(&length.to_be_bytes());
        head.extend_from_slice(&[0x37, 0xfa, 0x21, 0x3d]);
        self.stream.write_all(&head).await?;
        self.stream.flush().await
    }

    /// Sends a JSON frame.
    pub async fn send_json(&mut self, value: &Value) -> io::Result<()> {
        self.send_text(&value.to_string()).await
    }

    /// Reads one frame, or `None` when the connection is gone.
    pub async fn recv(&mut self) -> Option<Frame> {
        let first = self.read_exact(2).await?;
        let opcode = first.first().copied().unwrap_or(0) & 0x0f;
        let masked = first.get(1).copied().unwrap_or(0) & 0x80 != 0;
        let length = match first.get(1).copied().unwrap_or(0) & 0x7f {
            126 => {
                let (high, low) = match self.read_exact(2).await?.as_slice() {
                    [high, low] => (*high, *low),
                    _ => return None,
                };
                u64::from(u16::from_be_bytes([high, low]))
            }
            127 => {
                let bytes = self.read_exact(8).await?;
                let mut window = [0_u8; 8];
                window.copy_from_slice(&bytes);
                u64::from_be_bytes(window)
            }
            short => u64::from(short),
        };
        let mask = if masked {
            Some(self.read_exact(4).await?)
        } else {
            None
        };
        let mut payload = self.read_exact(usize::try_from(length).ok()?).await?;
        if let Some(mask) = mask {
            for (index, byte) in payload.iter_mut().enumerate() {
                if let Some(key) = mask.get(index % mask.len().max(1)) {
                    *byte ^= key;
                }
            }
        }
        match opcode {
            0x1 => Some(Frame::Text(
                serde_json::from_slice(&payload).unwrap_or(Value::Null),
            )),
            0x8 => {
                let code = match (payload.first(), payload.get(1)) {
                    (Some(high), Some(low)) => u16::from_be_bytes([*high, *low]),
                    _ => 1005,
                };
                Some(Frame::Close(code))
            }
            0xa => Some(Frame::Pong),
            other => Some(Frame::Other(other)),
        }
    }

    /// Reads frames until one matches, and answers `None` when the socket closes first.
    pub async fn recv_until<F>(&mut self, mut found: F) -> Option<Frame>
    where
        F: FnMut(&Frame) -> bool,
    {
        while let Some(frame) = self.recv().await {
            if found(&frame) {
                return Some(frame);
            }
        }
        None
    }

    /// Reads frames until the socket closes, and answers all of them.
    pub async fn drain(&mut self) -> Vec<Frame> {
        let mut frames = Vec::new();
        while let Some(frame) = self.recv().await {
            frames.push(frame);
        }
        frames
    }

    /// Exactly `count` bytes, from what arrived with the handshake first.
    async fn read_exact(&mut self, count: usize) -> Option<Vec<u8>> {
        while self.buffer.len() < count {
            let mut chunk = [0_u8; 2048];
            match self.stream.read(&mut chunk).await {
                Ok(0) | Err(_) => return None,
                Ok(read) => self
                    .buffer
                    .extend_from_slice(chunk.get(..read).unwrap_or_default()),
            }
        }
        Some(self.buffer.drain(..count).collect())
    }
}
