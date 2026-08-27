const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');

app.http('formLanding', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const headers = {
            'Access-Control-Allow-Origin': '*', 
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };

        if (request.method === "OPTIONS") {
            return { status: 204, headers: headers };
        }

        try {
            const body = await request.json();
            const { firstName, lastName, phone, email } = body || {};

            if (!firstName || !lastName || !phone || !email) {
                return { status: 400, headers: headers, body: "Missing required fields" };
            }

            const clean = (val) => `"${String(val).trim().replace(/"/g, '""')}"`;
            const csvLine = `${clean(firstName)},${clean(lastName)},${clean(phone)},${clean(email)}\n`;

            // Validate storage connection string
            const connStr = process.env.AzureWebJobsStorage;
            if (!connStr) {
                context.error('AzureWebJobsStorage is not set in Application Settings');
                return { status: 500, headers: headers, body: 'Server misconfiguration: storage not configured' };
            }

            const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
            const containerClient = blobServiceClient.getContainerClient('leads');

            // Ensure container exists (create if missing)
            try {
                await containerClient.createIfNotExists();
            } catch (err) {
                context.error('Failed to create or access container "leads":', err);
                return { status: 500, headers: headers, body: 'Storage container error' };
            }

            const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const blobName = `leads_${todayDate}.csv`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);

            let finalContent = "";
            const exists = await blockBlobClient.exists();

            if (exists) {
                try {
                    const buf = await blockBlobClient.downloadToBuffer();
                    const currentData = buf.toString('utf8');
                    finalContent = currentData + csvLine;
                } catch (err) {
                    context.error('Blob download failed:', err);
                    return { status: 500, headers: headers, body: 'Storage download failed' };
                }
            } else {
                const headersRow = "Name,Last Name,Phone,Email\n";
                finalContent = headersRow + csvLine;
            }

            try {
                const buffer = Buffer.from(finalContent, 'utf8');
                await blockBlobClient.uploadData(buffer, {
                    blobHTTPHeaders: { blobContentType: 'text/csv' }
                });
            } catch (err) {
                context.error('Blob upload failed:', err);
                return { status: 500, headers: headers, body: 'Storage upload failed' };
            }

            return { status: 200, headers: headers, body: "Lead registered successfully" };

        } catch (error) {
            context.error("Internal Server Error Details:", error);
            return { status: 500, headers: headers, body: "Internal Server Error" };
        }
    }
});

