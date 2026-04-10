/**
 * RAG (Retrieval-Augmented Generation) Service
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Uses ChromaDB for vector storage and LangChain for RAG pipeline
 */

import { ChromaClient } from 'chromadb';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ENV } from './_core/env';
import { invokeLLM } from './_core/llm';

// Initialize ChromaDB client
export const chromaClient = new ChromaClient({
  path: 'http://localhost:8000', // Assuming ChromaDB runs locally; adjust if needed
});

// Collection name for restaurant reviews
const COLLECTION_NAME = 'restaurant_reviews';

// Initialize embeddings (using OpenAI)
export const embeddings = new OpenAIEmbeddings({
  openAIApiKey: ENV.openaiApiKey || process.env.OPENAI_API_KEY, // Add to env if needed
  modelName: 'text-embedding-3-small',
});

// Initialize LLM for generation
// const llm = new ChatOpenAI({
//   openAIApiKey: ENV.openaiApiKey || process.env.OPENAI_API_KEY,
//   modelName: 'gpt-4o-mini',
// });

/**
 * Initialize ChromaDB collection
 */
export async function initRAGCollection() {
  // Add timeout to prevent hanging if ChromaDB is unavailable
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('ChromaDB connection timeout (5s)')), 5000)
  );

  try {
    // Check if collection exists with timeout
    const collections = await Promise.race([
      chromaClient.listCollections(),
      timeoutPromise
    ]) as any[];
    const collectionExists = collections.find(c => c.name === COLLECTION_NAME);

    if (!collectionExists) {
      await chromaClient.createCollection({
        name: COLLECTION_NAME,
        metadata: { description: 'Vector store for restaurant reviews and data' },
      });
      console.log('Created ChromaDB collection:', COLLECTION_NAME);
    } else {
      console.log('ChromaDB collection already exists:', COLLECTION_NAME);
    }
  } catch (error) {
    console.error('Error initializing RAG collection:', error);
    throw error;
  }
}

/**
 * Add restaurant data to vector store
 */
export async function addRestaurantToVectorStore(restaurant: {
  id: string;
  name: string;
  reviews: string[];
  description?: string;
  cuisineType?: string;
}) {
  // existing implementation
  try {
    const collection = await chromaClient.getCollection({ name: COLLECTION_NAME });

    // Create documents from reviews and metadata
    const documents: Array<{pageContent: string, metadata: any}> = [];

    // Add individual reviews
    restaurant.reviews.forEach((review, index) => {
      documents.push({
        pageContent: review,
        metadata: {
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          type: 'review',
          index,
          cuisineType: restaurant.cuisineType || '',
        },
      });
    });

    // Add restaurant description if available
    if (restaurant.description) {
      documents.push({
        pageContent: restaurant.description,
        metadata: {
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          type: 'description',
          cuisineType: restaurant.cuisineType || '',
        },
      });
    }

    // Generate embeddings and add to ChromaDB
    const vectors = await embeddings.embedDocuments(documents.map(doc => doc.pageContent));

    await collection.add({
      ids: documents.map((_, i) => `${restaurant.id}_${i}`),
      embeddings: vectors,
      metadatas: documents.map(doc => doc.metadata),
      documents: documents.map(doc => doc.pageContent),
    });

    console.log(`Added ${documents.length} documents for restaurant: ${restaurant.name}`);
  } catch (error) {
    console.error('Error adding restaurant to vector store:', error);
    throw error;
  }
}

/**
 * Attempt to create an embedding for an image.
 * - If a CLIP/vision embedding endpoint is configured (ENV.clipApiUrl), POST the image URL and use returned vector
 * - Otherwise, fallback to embedding the provided caption (or alt text) as text so the image is searchable
 */
async function getImageEmbedding(imageUrl: string, caption?: string): Promise<number[] | null> {
  // Prefer a configured CLIP/vision endpoint
  if (ENV.clipApiUrl) {
    try {
      const res = await fetch(ENV.clipApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, caption }),
      });
      if (!res.ok) throw new Error(`Clip API returned ${res.status}`);
      const payload = await res.json();
      return payload.embedding || null;
    } catch (err) {
      console.error('Error calling CLIP API, falling back to caption embedding:', err);
    }
  }

  // Fallback: embed caption text (or empty string) so image is still searchable
  try {
    const text = caption || 'Image of restaurant';
    const vec = await embeddings.embedQuery(text);
    return vec;
  } catch (err) {
    console.error('Error embedding image caption:', err);
    return null;
  }
}

/**
 * Add an image (photo) to the vector store for a restaurant
 */
export async function addRestaurantImageToVectorStore(params: {
  restaurantId: string;
  restaurantName: string;
  imageUrl: string;
  caption?: string;
}) {
  try {
    const collection = await chromaClient.getCollection({ name: COLLECTION_NAME });

    const embedding = await getImageEmbedding(params.imageUrl, params.caption);

    // If we couldn't create an embedding, add the image as a textual document (caption + url)
    if (!embedding) {
      const vecs = await embeddings.embedDocuments([params.caption || params.imageUrl]);
      const vec = Array.isArray(vecs[0]) ? vecs[0] : vecs as unknown as number[];

      await collection.add({
        ids: [`${params.restaurantId}_img_${Date.now()}`],
        embeddings: [vec],
        metadatas: [
          {
            restaurantId: params.restaurantId,
            restaurantName: params.restaurantName,
            type: 'image',
            imageUrl: params.imageUrl,
            caption: params.caption || '',
          },
        ],
        documents: [params.caption || params.imageUrl],
      });

      return;
    }

    await collection.add({
      ids: [`${params.restaurantId}_img_${Date.now()}`],
      embeddings: [embedding],
      metadatas: [
        {
          restaurantId: params.restaurantId,
          restaurantName: params.restaurantName,
          type: 'image',
          imageUrl: params.imageUrl,
          caption: params.caption || '',
        },
      ],
      documents: [params.caption || params.imageUrl],
    });
  } catch (error) {
    console.error('Error adding image to vector store:', error);
    throw error;
  }
}

/**
 * Query the vector store for relevant information
 */
export async function queryRestaurantRAG(query: string, restaurantId?: string, limit: number = 5) {
  try {
    const collection = await chromaClient.getCollection({ name: COLLECTION_NAME });

    // Generate query embedding
    const queryEmbedding = await embeddings.embedQuery(query);

    // Search for similar documents
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      where: restaurantId ? { restaurantId } : undefined,
    });

    return {
      documents: results.documents[0] || [],
      metadatas: results.metadatas[0] || [],
      distances: results.distances[0] || [],
    };
  } catch (error) {
    console.error('Error querying RAG:', error);
    throw error;
  }
}

/**
 * Generate a summary using RAG
 */
export async function generateRestaurantSummaryWithFetcher(
  query: string,
  restaurantId: string | undefined,
  fetcher: (q: string, id?: string, limit?: number) => Promise<any>,
) {
  try {
    // Get relevant documents
    const relevantDocs = await fetcher(query, restaurantId, 10);

    // Normalize results (ensure strings)
    const documents: string[] = (relevantDocs.documents || []).map((d: any) => (d == null ? '' : String(d)));
    const metadatas: any[] = (relevantDocs.metadatas || []).map((m: any) => (m == null ? {} : m));
    const distances: number[] = (relevantDocs.distances || []).map((n: any) => (n == null ? 0 : Number(n)));

    // Concatenate relevant content
    const context = documents.join('\n\n');

    // Use the app's LLM to generate summary
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes restaurant information based on reviews and data. Provide a concise, informative summary.',
        },
        {
          role: 'user',
          content: `Based on the following restaurant reviews and information:\n\n${context}\n\n${query}`,
        },
      ],
    });

    return response.choices[0]?.message?.content || 'No summary available';
  } catch (error) {
    console.error('Error generating summary:', error);
    throw error;
  }
}

export async function generateRestaurantSummary(query: string, restaurantId?: string) {
  return generateRestaurantSummaryWithFetcher(query, restaurantId, queryRestaurantRAG);
}