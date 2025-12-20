const path = require('path');

module.exports = {
  target: 'web',
  entry: './webview/index.tsx',
  output: {
    path: path.resolve(__dirname, 'out', 'webview'),
    filename: 'webview.js',
    publicPath: './',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: 'ts-loader',
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  optimization: {
    minimize: true, // Enable minification for production
  },
  externals: {
    vscode: 'commonjs vscode', // VS Code API is provided by the host
  },
  // Don't bundle node_modules - they should be excluded from package
  // React, React-DOM, Zustand will be bundled into webview.js
};

