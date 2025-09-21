# NYC 311 Viewer

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` file in `nyc-311-viewer/` with your Mapillary access token. The token is consumed in the browser, so use a key that is safe to expose to the client:

   ```
   NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN=your-token-here
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to explore noise complaints around NYC.

Street imagery responses are cached in the browser (local storage + in-memory) for seven days so repeat visits reuse the same Mapillary shots.

## Building & Previewing

- `npm run build` generates a static export in the `out/` directory that is ready to deploy to any static host, including GitHub Pages.
- `npm start` serves the prebuilt `out/` folder locally using [`serve`](https://www.npmjs.com/package/serve). Run `npm run build` first to make sure `out/` exists (the first execution will ask `npx` to download `serve` if it's not already cached locally).

## Deploying to GitHub Pages

1. Build the site with the repository base path so asset URLs match GitHub Pages (replace `noisy-nyc` with your repository name):

   ```bash
   NEXT_PUBLIC_BASE_PATH=/noisy-nyc npm run build
   ```

2. Publish the generated `out/` directory to the branch GitHub Pages serves (e.g. `gh-pages`). You can do this manually or via an action such as [`peaceiris/actions-gh-pages`](https://github.com/peaceiris/actions-gh-pages).

Once deployed, the site will be available at `https://<username>.github.io/<repository-name>/`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
