const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    mode: argv.mode || 'development',
    entry: './src/main.ts',

    output: {
      filename:   'bundle.js',
      path:       path.resolve(__dirname, 'dist'),
      clean:      false, // Avoid Windows EPERM failures when copied assets in dist are locked.
      publicPath: '/',
    },

    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@core':   path.resolve(__dirname, 'src/core'),
        '@combat': path.resolve(__dirname, 'src/combat'),
        '@units':  path.resolve(__dirname, 'src/units'),
        '@camera': path.resolve(__dirname, 'src/camera'),
        '@data':   path.resolve(__dirname, 'src/data'),
        '@ui':     path.resolve(__dirname, 'src/ui'),
      },
    },

    module: {
      rules: [
        {
          test: /\.ts$/,
          use:  'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: './index.html',
        filename: 'index.html',
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'public', to: '.' },
        ],
      }),
    ],

    devServer: {
      static: {
        directory: path.resolve(__dirname, 'dist'),
      },
      port:   8080,
      hot:    true,
      open:   false,
    },

    devtool: isDev ? 'inline-source-map' : false,

    performance: {
      hints: false, // Babylon.js bundles are large — suppress warnings
    },
  };
};
