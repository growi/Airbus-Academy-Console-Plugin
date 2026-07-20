/* eslint-env node */

import * as path from 'path';
import type { Configuration } from 'webpack';
import { ConsoleRemotePlugin } from '@openshift-console/dynamic-plugin-sdk-webpack';

const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const isProduction = process.env.NODE_ENV === 'production';

const config: Configuration = {
  mode: isProduction ? 'production' : 'development',
  entry: {},
  context: path.resolve(__dirname, 'src'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: isProduction ? '[name]-bundle-[contenthash].min.js' : '[name]-bundle.js',
    chunkFilename: isProduction ? '[name]-chunk-[contenthash].min.js' : '[name]-chunk.js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.(jsx?|tsx?)$/,
        exclude: /node_modules/,
        use: ['swc-loader']
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(m?js)$/,
        resolve: { fullySpecified: false }
      }
    ]
  },
  plugins: [
    new ConsoleRemotePlugin(),
    new ForkTsCheckerWebpackPlugin({
      typescript: { configFile: path.resolve(__dirname, 'tsconfig.json') }
    })
  ],
  devtool: isProduction ? false : 'source-map',
  optimization: {
    chunkIds: isProduction ? 'deterministic' : 'named',
    minimize: isProduction
  }
};

export default config;
