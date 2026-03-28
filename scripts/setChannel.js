const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '../package.json');
const buildDir = path.join(__dirname, '../build');

// Get the environment (e.g., dev, beta, prod)
const channel = process.argv[2] || 'dev'; // Default to 'dev'

// Function to copy icon based on channel
function copyIcon(channel) {
  const sourceIcon = channel === 'dev' ? 'icon_dev.png' : 'icon_prod.png';
  const targetIcon = 'icon.png';

  const sourcePath = path.join(buildDir, sourceIcon);
  const targetPath = path.join(buildDir, targetIcon);

  try {
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`Copied ${sourceIcon} to icon.png for ${channel} build`);
    } else {
      console.warn(`Warning: ${sourceIcon} not found in build directory`);
    }
  } catch (error) {
    console.error(`Error copying icon: ${error.message}`);
  }
}

fs.readFile(packageJsonPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading package.json:', err);
    process.exit(1);
  }

  try {
    const packageJson = JSON.parse(data);

    // Extract base version (e.g., "0.9.9" from "0.9.9-dev")
    const baseVersion = packageJson.version.split('-')[0];

    // Update version field
    packageJson.version = channel === 'latest' ? baseVersion : `${baseVersion}-${channel}`;

    // Update app name and appId with appropriate suffixes based on channel
    let packageName = 'monomail-desktop';
    let baseAppName = 'Mail Desktop';
    const baseAppId = 'io.github.erickim20.monomail-desktop';

    if (channel === 'dev') {
      packageJson.name = `${packageName}-dev`;
      packageJson.productName = `${baseAppName} (Dev)`;
      packageJson.build.appId = `${baseAppId}-dev`; // Add -dev suffix to appId
    } else if (channel === 'beta') {
      packageJson.name = packageName;
      packageJson.productName = baseAppName;
      packageJson.build.appId = `${baseAppId}`; // Add -beta suffix to appId
    } else {
      packageJson.name = packageName;
      packageJson.productName = baseAppName;
      packageJson.build.appId = baseAppId; // Keep original appId for production
    }

    // Copy the appropriate icon
    copyIcon(channel);

    fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8', (err) => {
      if (err) {
        console.error('Error updating package.json:', err);
        process.exit(1);
      }
      console.log(`Updated version to: ${packageJson.version}`);
      console.log(`Updated app name to: ${packageJson.name}`);
      console.log(`Updated appId to: ${packageJson.build.appId}`);
    });
  } catch (error) {
    console.error('Error parsing package.json:', error);
    process.exit(1);
  }
});
