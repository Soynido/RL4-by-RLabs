const path = require('path');

module.exports = {
  target: 'web',
  entry: './webview/index.tsx',
  output: {
    path: path.resolve(__dirname, 'out', 'webview'),
    filename: 'webview.js',
    // Disable dynamic imports and code splitting completely
    chunkLoading: false,
    wasmLoading: false,
    // Ensure single bundle
    library: {
      type: 'var',
      name: 'RL4WebView',
    },
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
  },
  optimization: {
    // Completely disable code splitting
    splitChunks: false,
    runtimeChunk: false,
    // Disable module concatenation that might cause issues
    concatenateModules: false,
  },
  externals: {
    vscode: 'commonjs vscode',
  },
};

