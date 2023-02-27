import babel from '@rollup/plugin-babel'
import copy from 'rollup-plugin-copy'
import alias from '@rollup/plugin-alias'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import scss from 'rollup-plugin-scss'
import sass from 'sass'

const config = {
    input: 'src/main.tsx',
    output: {
        dir: 'dist',
        format: 'iife'
    },
    plugins: [
        babel({
            babelHelpers: 'bundled',
            exclude: ['node_modules/**'],
            extensions: ['.js', '.jsx', '.ts', '.tsx']
        }),
        alias({
          entries: [
            { find: 'react', replacement: 'preact/compat' },
            { find: 'react-dom/test-utils', replacement: 'preact/test-utils' },
            { find: 'react-dom', replacement: 'preact/compat' },
            { find: 'react/jsx-runtime', replacement: 'preact/jsx-runtime' }
          ]
        }),
        nodeResolve({
            extensions: ['.js', '.jsx', '.ts', '.tsx', '.scss']
        }),
        scss({
            fileName: 'assets/style.css',
            sass: sass
        }),
        copy({
            targets: [
                { src: 'src/index.html', dest: 'dist' },
                { src: 'assets', dest: 'dist' }
            ]
        })
    ]
};

export default config;