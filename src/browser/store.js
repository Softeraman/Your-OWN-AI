const DB_NAME = "vectordb-studio-local-v1";
export function createStore() {
  let opened;
  const db = () =>
    (opened ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("state");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          new Error(
            "Browser storage is unavailable. Enable site storage to save your data.",
          ),
        );
    }));
  return {
    async load() {
      const database = await db();
      return new Promise((resolve, reject) => {
        const tx = database.transaction("state", "readonly");
        const request = tx.objectStore("state").get("database");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async save(value) {
      const database = await db();
      return new Promise((resolve, reject) => {
        const tx = database.transaction("state", "readwrite");
        tx.objectStore("state").put(value, "database");
        tx.oncomplete = () => resolve();
        tx.onerror = () =>
          reject(
            new Error("Could not save data. Browser storage may be full."),
          );
        tx.onabort = () =>
          reject(new Error("Saving data was interrupted. Please try again."));
      });
    },
  };
}
