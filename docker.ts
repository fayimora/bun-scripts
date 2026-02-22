import { Result, TaggedError } from "better-result";

const DOCKER_SOCKET = "/var/run/docker.sock";

class DockerApiError extends TaggedError("DockerApiError")<{
  message: string;
  status: number;
}>() { }

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  State: string;
  Status: string;
  Ports: {
    IP?: string;
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }[];
  Labels: Record<string, string>;
  Mounts: {
    Type: string;
    Name?: string;
    Source: string;
    Destination: string;
    Mode: string;
    RW: boolean;
  }[];
  NetworkSettings: {
    Networks: Record<
      string,
      {
        NetworkID: string;
        Gateway: string;
        IPAddress: string;
        MacAddress: string;
      }
    >;
  };
}

async function listContainers(all: boolean = false) {
  return Result.gen(async function*() {
    const params = all ? "?all=true" : "";

    const response = yield* Result.await(
      Result.tryPromise(() =>
        fetch(`http://localhost/containers/json${params}`, {
          unix: DOCKER_SOCKET,
        }),
      ),
    );

    if (!response.ok) {
      return Result.err(
        new DockerApiError({
          message: `Docker API error: ${response.status} ${response.statusText}`,
          status: response.status,
        }),
      );
    }

    const containers = yield* Result.await(
      Result.tryPromise(() => response.json() as Promise<DockerContainer[]>),
    );

    return Result.ok(containers);
  });
}

const result = await listContainers(true); // all=true to see stopped containers too

if (result.isErr()) {
  const error = result.error;
  const message = DockerApiError.is(error) ? error.message : error.message;
  console.error("Failed to list containers:", message);
  process.exit(1);
}

const containers = result.value;

console.log(`Found ${containers.length} containers:\n`);

for (const container of containers) {
  const names = container.Names.join(", ");
  const status = container.Status;
  const image = container.Image;

  console.log(`  ${names}`);
  console.log(`    Image: ${image}`);
  console.log(`    Status: ${status}`);
  console.log(`    ID: ${container.Id.slice(0, 12)}`);
  console.log();
}
