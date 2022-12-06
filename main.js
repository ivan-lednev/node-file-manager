import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as stream from "stream/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import * as zlib from "zlib";

const args = process.argv.slice(2);
const username =
  args
    .find((arg) => arg.startsWith("--username="))
    ?.replace("--username=", "") || "Anonymous";

let workingDirectory = os.homedir();

function inWorkingDir(...paths) {
  return path.resolve(workingDirectory, ...paths);
}

function handleExit() {
  console.log(`Thank you for using File Manager, ${username}, goodbye!`);
  process.exit();
}

function handleUp() {
  workingDirectory = inWorkingDir("..");
}

function handleCd([destination]) {
  const newDirectory = inWorkingDir(destination);
  fs.accessSync(newDirectory);
  workingDirectory = newDirectory;
}

function handleLs() {
  const contents = fs.readdirSync(workingDirectory, { withFileTypes: true });
  const files = contents
    .filter((item) => item.isFile())
    .sort()
    .map((file) => ({ name: file.name, type: "file" }));
  const directories = contents
    .filter((item) => item.isDirectory())
    .sort()
    .map((dir) => ({
      name: dir.name,
      type: "directory",
    }));
  const rest = contents
    .filter((item) => !item.isDirectory() && !item.isFile())
    .sort()
    .map((item) => ({ name: item.name, type: "something else" }));

  console.table([...directories, ...files, ...rest]);
}

async function streamToString(stream) {
  let data = "";

  for await (const chunk of stream) {
    data += chunk.toString();
  }

  return data;
}

async function handleCat([fileName]) {
  const filePath = inWorkingDir(fileName);
  const fileHandle = fs.createReadStream(filePath);
  const contents = await streamToString(fileHandle);
  console.log(contents);
}

function handleAdd([fileName]) {
  fs.openSync(inWorkingDir(fileName), "w");
}

function handleRn([path, newName]) {
  fs.renameSync(inWorkingDir(path), inWorkingDir(newName));
}

async function handleCp([pathToFile, pathToNewDirectory]) {
  await stream.pipeline(
    fs.createReadStream(inWorkingDir(pathToFile)),
    fs.createWriteStream(
      inWorkingDir(pathToNewDirectory, path.basename(pathToFile))
    )
  );
}

function deleteFile(pathToFile) {
  fs.rmSync(inWorkingDir(pathToFile));
}

async function handleMv([pathToFile, pathToDestination]) {
  await stream.pipeline(
    fs.createReadStream(inWorkingDir(pathToFile)),
    fs.createWriteStream(inWorkingDir(pathToDestination))
  );

  deleteFile(pathToFile);
}

function handleRm([pathToFile]) {
  deleteFile(pathToFile);
}

function handleOs([flag]) {
  switch (flag) {
    case "--EOL":
      const visibleEol = os.EOL === "\r\n" ? "\\r\\n" : "\\n";
      console.log(visibleEol);
      break;
    case "--cpus":
      const cpus = os.cpus();
      console.log(`CPU count: ${cpus.length}`);
      const cpuTable = cpus.map(({ model, speed }) => ({
        model,
        speed: speed / 1000,
      }));
      console.table(cpuTable);
      break;
    case "--homedir":
      console.log(os.homedir());
      break;
    case "--username":
      console.log(os.userInfo().username);
      break;
    case "--architecture":
      console.log(os.arch());
      break;
    default:
      throw new Error("Unknown flag");
  }
}

async function handleHash([pathToFile]) {
  // TODO: change actual working dir
  const readStream = createReadStream(inWorkingDir(pathToFile));
  const hash = createHash("sha256");

  await stream.pipeline(readStream, hash);

  console.log(hash.digest("hex"));
}

async function handleCompress([pathToFile, pathToDestination]) {
  const compressor = zlib.createBrotliCompress();

  await stream.pipeline(
    fs.createReadStream(inWorkingDir(pathToFile)),
    compressor,
    fs.createWriteStream(inWorkingDir(pathToDestination))
  );
}

async function handleDecompress([pathToFile, pathToDestination]) {
  const decompressor = zlib.createBrotliDecompress();

  await stream.pipeline(
    fs.createReadStream(inWorkingDir(pathToFile)),
    decompressor,
    fs.createWriteStream(inWorkingDir(pathToDestination))
  );
}

async function handleCommand(userInput) {
  const [command, ...args] = userInput.toString().trim().split(/ +/);

  try {
    switch (command) {
      case ".exit":
        handleExit();
        break;
      case "up":
        handleUp();
        break;
      case "cd":
        handleCd(args);
        break;
      case "ls":
        handleLs();
        break;
      case "cat":
        await handleCat(args);
        break;
      case "add":
        handleAdd(args);
        break;
      case "rn":
        handleRn(args);
        break;
      case "cp":
        await handleCp(args);
        break;
      case "mv":
        await handleMv(args);
        break;
      case "rm":
        handleRm(args);
        break;
      case "os":
        handleOs(args);
        break;
      case "hash":
        await handleHash(args);
        break;
      case "compress":
        await handleCompress(args);
        break;
      case "decompress":
        await handleDecompress(args);
        break;
      default:
        console.log("Invalid command");
    }
  } catch (error) {
    console.log("Operation failed");
  }

  console.log(`You are currently in ${workingDirectory}`);
}

console.log(`Welcome to the File Manager, ${username}!`);
console.log(`You are currently in ${workingDirectory}`);

process.stdin.on("data", async (data) => {
  await handleCommand(data);
});

process.on("SIGINT", handleExit);
