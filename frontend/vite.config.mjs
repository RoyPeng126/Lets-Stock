import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

/** ---- 漂亮網址 middleware：rewrite + redirect ---- */
function prettyUrls() {
  const isTemplatePath = (p) =>
    p.startsWith('/layout/') || p.startsWith('/partials/');

  return {
    name: 'pretty-urls',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const original = req.url || '/';
        const [pathname, search = ''] = original.split('?');
        const accept = String(req.headers.accept || '');

        // 1) *.html → 302 重導，但模板路徑跳過
        if (
          pathname.endsWith('.html') &&
          !isTemplatePath(pathname) &&
          accept.includes('text/html')
        ) {
          if (pathname === '/index.html') {
            res.statusCode = 302;
            res.setHeader('Location', '/' + (search ? '?' + search : ''));
            return res.end();
          }
          const clean = pathname.replace(/\.html$/, '');
          res.statusCode = 302;
          res.setHeader('Location', clean + (search ? '?' + search : ''));
          return res.end();
        }

        // 2) 無副檔名 → 嘗試找同名 .html 或資料夾 index.html
        if (pathname && pathname !== '/' && !path.extname(pathname)) {
          const root = process.cwd();
          const htmlFile = path.join(root, pathname + '.html');
          if (fs.existsSync(htmlFile)) {
            req.url = pathname + '.html' + (search ? '?' + search : '');
            return next();
          }
          const dirIndex = path.join(
            root,
            pathname.replace(/\/?$/, '/'),
            'index.html'
          );
          if (fs.existsSync(dirIndex)) {
            req.url =
              pathname.replace(/\/?$/, '/') +
              'index.html' +
              (search ? '?' + search : '');
            return next();
          }
        }

        next();
      });
    },
    configurePreviewServer(server) {
      return this.configureServer(server);
    }
  }
}


/** ---- 你原本的多頁入口自動掃描 ---- */
const htmlInputs = {}
const htmlFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'))
for (const file of htmlFiles) {
  const name = path.basename(file, '.html')
  htmlInputs[name] = path.resolve(__dirname, file)
}

export default defineConfig({
  plugins: [
    prettyUrls() // ← 新增
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true
      }
    }
  },
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    rollupOptions: {
      input: htmlInputs
    }
  }
})
