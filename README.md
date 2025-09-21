# NYC 311 Viewer

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` file in `nyc-311-viewer/` with your Mapillary access token. The token is consumed in the browser, so use a key that is safe to expose to the client:

   ```
   MAPILLARY_ACCESS_TOKEN=your-token-here
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to explore noise complaints around NYC.

Street imagery responses are cached in the browser (local storage + in-memory) for seven days so repeat visits reuse the same Mapillary shots.

## Building & Previewing

- `npm run build` creates a production build in the `.next/` directory.
- `npm start` runs the compiled build with the Next.js production server. Run `npm run build` first so the compiled assets are available.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
