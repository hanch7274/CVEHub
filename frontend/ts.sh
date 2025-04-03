# 각 기능 폴더에 진입점 index.ts 파일 추가
for dir in src/features/*/; do
  echo "export * from './hooks';" > "${dir}index.ts"
  echo "export * from './services';" >> "${dir}index.ts"
  echo "export * from './types';" >> "${dir}index.ts"
done
