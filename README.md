# Mail Desktop

Electron desktop email client. Configure your own API, Firebase, domains, and billing via environment variables.

## Setup

See **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** for prerequisites, `.env.development`, and how to run `npm run dev`.

### Environment variables

Copy `.env.example` to `.env.development` and set values for your backend and hosting. All public app variables use the `MONO_ENV_*` prefix (see the example file and the getting started doc).

### Install and dev

```bash
git clone https://github.com/erickim20/monomail-desktop.git
cd monomail-desktop
npm install
npm run dev
```

### Build

```bash
npm run build
```

Packaging and code signing are configured for your own `appId`, updater URL, and certificates — replace placeholders in `package.json` / `electron-builder.yml` / `dev-app-update.yml` for distribution.

## License

This project is licensed under the [MIT License](LICENSE).
