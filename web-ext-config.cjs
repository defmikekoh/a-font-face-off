module.exports = {
  sourceDir: './src',
  artifactsDir: './web-ext-artifacts',
  build: {
    overwriteDest: true,
  },
  ignoreFiles: [
    'custom-fonts-example.css',
    'custom-fonts-example-data-blob.css',
    'gdrive-config.example.js',
    '*.md',
    '.DS_Store',
    'Thumbs.db',
  ],
};
