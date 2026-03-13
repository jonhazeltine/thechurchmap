import * as fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const MAPBOX_USERNAME = 'jonhazeltine';
const TILESET_NAME = 'all-churches-v8';  // US-only with name, city, state properties
const MBTILES_PATH = './all-churches-v8.mbtiles';

async function uploadToMapbox() {
  const secretToken = process.env.MAPBOX_SECRET_TOKEN;
  
  if (!secretToken) {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MAPBOX TILESET UPLOAD - MANUAL UPLOAD REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The vector tiles have been generated successfully:
  File: ${MBTILES_PATH}
  Size: ${(fs.statSync(MBTILES_PATH).size / 1024 / 1024).toFixed(2)} MB
  Churches: 239,341

MANUAL UPLOAD INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to Mapbox Studio: https://studio.mapbox.com/tilesets/

2. Click "New tileset" button

3. Upload the file: ${MBTILES_PATH}

4. Name the tileset: ${TILESET_NAME}

5. Once uploaded, the tileset ID will be:
   ${MAPBOX_USERNAME}.${TILESET_NAME}

6. Use this tileset ID in your MapView component to add the layer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AUTOMATED UPLOAD (Optional):
If you want to automate uploads in the future, provide a MAPBOX_SECRET_TOKEN
environment variable. Create a secret token at:
https://account.mapbox.com/access-tokens/

The token needs 'uploads:write' scope.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
    return;
  }

  console.log('Starting Mapbox upload...');
  console.log(`File: ${MBTILES_PATH}`);
  console.log(`Tileset: ${MAPBOX_USERNAME}.${TILESET_NAME}`);

  const fileStats = fs.statSync(MBTILES_PATH);
  console.log(`Size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);

  try {
    const credentialsUrl = `https://api.mapbox.com/uploads/v1/${MAPBOX_USERNAME}/credentials?access_token=${secretToken}`;
    
    console.log('Getting upload credentials from Mapbox...');
    const credentials = await fetch(credentialsUrl, { method: 'POST' })
      .then(r => r.json());
    
    if (credentials.message) {
      console.error('Error getting upload credentials:', credentials.message);
      return;
    }

    console.log('Got upload credentials, uploading to S3...');
    console.log(`Bucket: ${credentials.bucket}`);
    console.log(`Key: ${credentials.key}`);
    
    const s3Client = new S3Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    const fileContent = fs.readFileSync(MBTILES_PATH);
    console.log(`Reading file... ${fileContent.length} bytes`);
    
    const putCommand = new PutObjectCommand({
      Bucket: credentials.bucket,
      Key: credentials.key,
      Body: fileContent,
    });

    console.log('Uploading to S3 (this may take a few minutes for 70MB file)...');
    await s3Client.send(putCommand);
    console.log('Uploaded to S3 successfully!');

    console.log('Creating tileset in Mapbox...');
    const createUrl = `https://api.mapbox.com/uploads/v1/${MAPBOX_USERNAME}?access_token=${secretToken}`;
    
    const result = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: credentials.url,
        tileset: `${MAPBOX_USERNAME}.${TILESET_NAME}`,
        name: 'All Churches'
      })
    }).then(r => r.json());

    if (result.error) {
      console.error('Error creating tileset:', result.error);
      return;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  UPLOAD INITIATED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\nUpload ID: ${result.id}`);
    console.log(`Tileset ID: ${MAPBOX_USERNAME}.${TILESET_NAME}`);
    console.log(`Status: ${result.complete ? 'Complete' : 'Processing...'}`);
    console.log(`\nMapbox is now processing your tileset. This typically takes 5-15 minutes.`);
    console.log(`Check progress at: https://studio.mapbox.com/tilesets/`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('Upload failed:', error);
  }
}

uploadToMapbox();
