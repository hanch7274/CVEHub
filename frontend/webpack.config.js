// 번들 분석 및 최적화
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  // 기존 설정...
  plugins: [
    // 개발 모드에서만 사용
    process.env.ANALYZE && new BundleAnalyzerPlugin()
  ].filter(Boolean),
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    }
  }
}; 