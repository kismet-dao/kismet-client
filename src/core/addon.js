import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';

const execPromise = util.promisify(exec);

class AddonManager {

    async isInstalled(packageName) {
        try {
            const packagePath = `../../../node_modules/${packageName}`;
            await fs.access(packagePath);

            console.log(`✅ Package ${packageName} found at ${packagePath} (Installed)`); // Success log
            return true;

        } catch (error) {
            console.log(`❌ Package ${packageName} not found (Not Installed)`); // Failure log
            return false;
        }
    }

    async install(packageName) {
        try {
            const command = `npm install ${packageName}`;
            const { stdout, stderr } = await execPromise(command, { maxBuffer: 1024 * 1024 });

            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);

            const installErrorRegex = /npm ERR! |npm: ERR!/i;
            if (installErrorRegex.test(stderr)) {
                throw new Error(stderr);
            }

            console.log(`✅ Successfully installed ${packageName}`); // Install success log

        } catch (error) {
            console.error(`❌ Error installing ${packageName}:`, error); // Install failure log
            throw error;
        }
    }

    async uninstall(packageName) {
        try {
            const command = `npm uninstall ${packageName}`;
            const { stdout, stderr } = await execPromise(command, { maxBuffer: 1024 * 1024 });

            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);

            const uninstallErrorRegex = /npm ERR! |npm: ERR!/i;
            if (uninstallErrorRegex.test(stderr)) {
                throw new Error(stderr);
            }
            console.log(`✅ Successfully uninstalled ${packageName}`); // Uninstall success log

        } catch (error) {
            console.error(`❌ Error uninstalling ${packageName}:`, error); // Uninstall failure log
            throw error;
        }
    }
}

const addonManager = new AddonManager();
export default addonManager;