import { Application } from './src/core/app.js';
import chalk from 'chalk';



const ASCII_LOGO = `
////////////////////////////////////////////////////////////////////////////
//                                                                        //
//                                                                        //
//                                                                        //
//      __  __     __     ______     __    __     ______     ______       //
//     /\\ \\/ /    /\\ \\   /\\  ___\\   /\\ "-./  \\   /\\  ___\\   /\\__  _\\      //
//     \\ \\  _"-.  \\ \\ \\  \\ \\___  \\  \\ \\ \\-./\\ \\  \\ \\  __\\   \\/_/\\ \\/      //
//      \\ \\_\\ \\_\\  \\ \\_\\  \\ \\_____\\  \\ \\_\\ \\ \\_\\  \\ \\_____\\    \\ \\_\\      //
//       \\/_/\\/_/   \\/_/   \\/_____/   \\/_/  \\/_/   \\/_____/     \\/_/      //
//                                                                        //
//                                                                        //
//                                                                        //
////////////////////////////////////////////////////////////////////////////
`;

console.clear();
console.log(chalk.cyan(ASCII_LOGO));

try {
    const app = new Application();
    await app.start();
} catch (error) {
    console.error(chalk.red.bold('\n❌ Fatal Error:'), error.message);
    process.exit(1);
}

process.on('unhandledRejection', error => {
    console.error(chalk.red.bold('\n❌ Unhandled Promise:'), error.message);
    process.exit(1);
});