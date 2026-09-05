import {
  elasticsearch,
  EMAIL_INDEX,
} from "../config/elasticsearch";

type EmailSearchData = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: Date;
  sentAt?: Date | null;
};

export async function indexEmail(
  email: EmailSearchData
) {
  try {
    await elasticsearch.index({
      index: EMAIL_INDEX,
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

    console.log(
      `Email ${email.id} indexed in Elasticsearch.`
    );
  } catch (error) {
    console.error(
      "Elasticsearch indexing error:",
      error
    );
  }
}

export async function searchEmails(
  query: string
) {
  const result = await elasticsearch.search({
    index: EMAIL_INDEX,
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

  return result.hits.hits.map(
    (hit) => hit._source
  );
}