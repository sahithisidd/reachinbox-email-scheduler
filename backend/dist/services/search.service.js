"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexEmail = indexEmail;
exports.searchEmails = searchEmails;
const elasticsearch_1 = require("../config/elasticsearch");
async function indexEmail(email) {
    try {
        await elasticsearch_1.elasticsearch.index({
            index: elasticsearch_1.EMAIL_INDEX,
            id: email.id,
            document: {
                id: email.id,
                recipient: email.recipient,
                subject: email.subject,
                body: email.body,
                status: email.status,
                scheduledAt: email.scheduledAt,
                sentAt: email.sentAt || null,
            },
            refresh: true,
        });
        console.log(`Email ${email.id} indexed in Elasticsearch.`);
    }
    catch (error) {
        console.error("Elasticsearch indexing error:", error);
    }
}
async function searchEmails(query) {
    const result = await elasticsearch_1.elasticsearch.search({
        index: elasticsearch_1.EMAIL_INDEX,
        query: {
            multi_match: {
                query,
                fields: [
                    "recipient",
                    "subject",
                    "body",
                    "status",
                ],
            },
        },
    });
    return result.hits.hits.map((hit) => hit._source);
}
