import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/webview/index.tsx'],
  bundle: true,
  outfile: 'dist/webview/index.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  minify: false,
  jsx: 'automatic',
  loader: {
    '.css': 'css',
    '.png': 'file',
    '.svg': 'file',
  },
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
  },
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[webview] watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('[webview] build complete');
}
