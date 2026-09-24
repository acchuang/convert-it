import nextConfig from 'eslint-config-next';
import prettier from 'eslint-config-prettier';

const config = [...nextConfig, prettier];

export default config;
