module.exports = {
  apps: [
    {
      name: 'board_back',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 9060,
      },
    },
  ],
};