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
            const { firstName, lastName, phone, email } = body;

            if (!firstName || !lastName || !phone || !email) {
                return { status: 400, headers: headers, body: "Missing required fields" };
            }

            const clean = (val) => `"${val.trim().replace(/"/g, '""')}"`;
            const csvLine = `${clean(firstName)},${clean(lastName)},${clean(phone)},${clean(email)}\n`;

            const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AzureWebJobsStorage);
            const containerClient = blobServiceClient.getContainerClient('leads');
            
            const todayDate = new Date().toISOString().split('T');
            const blobName = `leads_${todayDate}.csv`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);

            let finalContent = "";
            const exists = await blockBlobClient.exists();

            if (exists) {
                const downloadResponse = await blockBlobClient.download(0);
                const currentData = await streamToString(downloadResponse.readableStreamBody);
                finalContent = currentData + csvLine;
            } else {
                const headersRow = "Name,Last Name,Phone,Email\n";
                finalContent = headersRow + csvLine;
            }

            await blockBlobClient.upload(finalContent, finalContent.length, {
                blobHTTPHeaders: { blobContentType: 'text/csv' }
            });

            return { status: 200, headers: headers, body: "Lead registered successfully" };

        } catch (error) {
            context.error("Internal Server Error Details:", error);
            return { status: 500, headers: headers, body: "Internal Server Error" };
        }
    }
});

async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on("data", (data) => chunks.push(data.toString()));
        readableStream.on("end", () => resolve(chunks.join("")));
        readableStream.on("error", reject);
    });
}
add backend function file
