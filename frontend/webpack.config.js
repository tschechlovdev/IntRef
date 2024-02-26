const MiniCssExtractPlugin = require('mini-css-extract-plugin');
var HtmlWebpackPlugin = require('html-webpack-plugin');
var path = require('path');


module.exports = {
  mode: "development",
  devtool: "inline-source-map",
  entry: "./src/index.ts",
  output: {
    filename: "bundle.js"
  },
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: [".ts", ".tsx", ".js", ".css", ".hbs"]
  },
  plugins: [
    new HtmlWebpackPlugin({  // Also generate a test.html
      filename: 'index.html',
      template: 'src/index.html'
    }),
    new MiniCssExtractPlugin("style.css"),
  ],
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      {
        test: /\.tsx?$/,
        loader: "ts-loader"
      },
      {
        test: /\.hbs/,
        use: "handlebars-loader"
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      },
      {
        test: /\.jpe?g$|\.gif$|\.png$/,
        use: require.resolve("file-loader") + "?name=images/[name].[ext]"
      }
    ]
  }
};


