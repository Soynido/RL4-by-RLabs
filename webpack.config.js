const path = require('path');

module.exports = {
  target: 'node',
  entry: {
    extension: './extension.ts',
    'kernel/process/entrypoint': './kernel/process/entrypoint.ts'
  },
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: '[name].js',  // Génère extension.js et kernel/process/entrypoint.js
    libraryTarget: 'commonjs2',
    clean: false  // Ne pas nettoyer pour garder les fichiers compilés par tsc
  },
  externals: {
    vscode: 'commonjs vscode',
    fsevents: 'commonjs fsevents'
  },
  module: {
    rules: [{
      test: /\.ts$/,
      exclude: /node_modules/,
      use: 'ts-loader'
    }]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, '.')
    }
  },
  node: {
    __dirname: false,
    __filename: false
  },
  optimization: {
    minimize: false
  }
};