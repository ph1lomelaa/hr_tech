
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal, create_tables
from app.vector_store.ingestion import ingest_all_documents


async def main():
    print("Загрузка документов в ChromaDB...")
    await create_tables()
    async with AsyncSessionLocal() as db:
        total = await ingest_all_documents(db)
    print(f"✅ Загружено чанков: {total}")
    print("Теперь RAG-поиск будет работать по реальным документам ВНД")


if __name__ == "__main__":
    asyncio.run(main())
