# Publishing

`rrule-kit` is currently installable from GitHub:

```bash
npm install github:iankar8/rrule-kit#v0.1.1
```

The npm package name is available as of 2026-05-22, but this machine is not authenticated to npm.

## Publish To npm

```bash
npm login
npm test
npm run build
npm publish --access public
```

The `prepublishOnly` script also runs tests and build before publish.

After publishing, update `README.md`:

```bash
npm install rrule-kit
```
