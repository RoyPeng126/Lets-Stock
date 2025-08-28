module.exports = {
    apps: [{
        name: 'lets-stock-backend',
        script: 'index.js',
        cwd: '/var/www/lets-stock/backend',

        //  開發：用專案根目錄的 .env
        env: {
            NODE_ENV: 'dev'
        },
        // 測試環境（需 --env test )
        env_test: {
            NODE_ENV: 'test',
            DOTENV_CONFIG_PATH: '/etc/lets-stock_backend/.env.test'
        },
        // 生產環境（需 --env production）
        env_production: {
            NODE_ENV: 'production',
            DOTENV_CONFIG_PATH: '/etc/lets-stock_backend/.env.production'
        }
    }]
}
