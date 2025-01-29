import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';

const execPromise = util.promisify(exec);

class AddonManager {
    constructor() {
        this.nodeModulesPath = path.resolve('node_modules');
    }

    async isInstalled(packageName) {
        try {
            // For scoped packages, we need to handle the path differently
            const packagePath = packageName.startsWith('@') 
                ? path.join(this.nodeModulesPath, ...packageName.split('/'))
                : path.join(this.nodeModulesPath, packageName);
                
            await fs.access(packagePath);
            console.log(`✅ Package ${packageName} found at ${packagePath} (Installed)`);
            return true;
        } catch (error) {
            console.log(`❌ Package ${packageName} not found (Not Installed)`);
            return false;
        }
    }

    async install(packageName) {
        try {
            console.log(`📦 Starting installation of ${packageName}...`);
            const { stdout, stderr } = await execPromise(`npm install ${packageName}`, {
                maxBuffer: 1024 * 1024
            });

            if (stderr && /npm ERR! |npm: ERR!/i.test(stderr)) {
                throw new Error(`npm install error: ${stderr}`);
            }

            // Verify installation
            const installed = await this.isInstalled(packageName);
            if (!installed) {
                throw new Error('Package not found after installation');
            }

            console.log(`✅ Successfully installed ${packageName}`);
            return true;
        } catch (error) {
            console.error(`❌ Error installing ${packageName}:`, error);
            throw new Error(`Failed to install ${packageName}: ${error.message}`);
        }
    }

    async uninstall(packageName) {
        try {
            console.log(`🗑️ Starting uninstallation of ${packageName}...`);
            
            // First verify the package exists
            const exists = await this.isInstalled(packageName);
            if (!exists) {
                console.log(`Package ${packageName} is not installed, nothing to uninstall`);
                return true;
            }

            // Run npm uninstall with --save flag to ensure it's removed from package.json
            const { stdout, stderr } = await execPromise(`npm uninstall --save ${packageName}`, {
                maxBuffer: 1024 * 1024
            });

            if (stderr && /npm ERR! |npm: ERR!/i.test(stderr)) {
                throw new Error(`npm uninstall error: ${stderr}`);
            }

            // Get the full package path
            const packagePath = packageName.startsWith('@')
                ? path.join(this.nodeModulesPath, ...packageName.split('/'))
                : path.join(this.nodeModulesPath, packageName);

            // Force remove the package directory if it still exists
            try {
                await fs.rm(packagePath, { recursive: true, force: true });
                console.log(`✅ Manually removed package directory: ${packagePath}`);
            } catch (error) {
                console.log(`📝 Package directory already removed or not accessible: ${packagePath}`);
            }

            // Verify uninstallation
            const stillInstalled = await this.isInstalled(packageName);
            if (stillInstalled) {
                throw new Error('Package still present after uninstallation');
            }

            console.log(`✅ Successfully uninstalled ${packageName}`);
            return true;
        } catch (error) {
            console.error(`❌ Error uninstalling ${packageName}:`, error);
            throw new Error(`Failed to uninstall ${packageName}: ${error.message}`);
        }
    }
}

const addonManager = new AddonManager();
export default addonManager;