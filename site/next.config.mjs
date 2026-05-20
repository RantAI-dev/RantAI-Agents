import nextra from 'nextra'

const withNextra = nextra({
  contentDirBasePath: '/docs',
})

export default withNextra({
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
})
