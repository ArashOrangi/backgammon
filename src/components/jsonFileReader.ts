import fs from "node:fs/promises";

export async function jsonFileReader<T>({
  filePath,
}: {
  filePath: string;
}): Promise<T[]> {
  const fileContent = await fs.readFile(filePath, { encoding: "utf-8" });

  return new Promise((resolve, reject) => {
    try {
      resolve(JSON.parse(fileContent));
    } catch (error) {
      reject(error);
    }
  });
}
