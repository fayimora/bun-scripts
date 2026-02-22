import { Result, TaggedError } from "better-result";

const TAILSCALE_SOCKET = "/var/run/tailscale/tailscaled.sock";

class TailscaleApiError extends TaggedError("TailscaleApiError")<{
  message: string;
  status: number;
}>() { }

interface TailscaleStatus {
  Version: string;
  BackendState: string;
  Self: {
    ID: string;
    Name: string;
    TailscaleIPs: string[];
    HostName: string;
    DNSName: string;
    UserID: number;
  };
  Peer: Record<
    string,
    {
      ID: string;
      Name: string;
      TailscaleIPs: string[];
      HostName: string;
      DNSName: string;
      UserID: number;
      Online: boolean;
      OS: string;
      LastSeen: string;
      Tags?: string[];
    }
  >;
  User: Record<
    string,
    {
      ID: number;
      DisplayName: string;
      ProfilePicURL: string;
      Roles: string[];
    }
  >;
}

async function getTailscaleStatus() {
  return Result.gen(async function*() {
    const response = yield* Result.await(
      Result.tryPromise(() =>
        fetch("http://local-tailscaled.sock/localapi/v0/status", {
          unix: TAILSCALE_SOCKET,
        }),
      ),
    );

    if (!response.ok) {
      const body = yield* Result.await(
        Result.tryPromise(() => response.text()),
      );

      return Result.err(
        new TailscaleApiError({
          message: `Local API error ${response.status}: ${body}`,
          status: response.status,
        }),
      );
    }

    const status = yield* Result.await(
      Result.tryPromise(() => response.json() as Promise<TailscaleStatus>),
    );

    // console.log("Raw Tailscale status response:", status);
    return Result.ok(status);
  });
}

const result = await getTailscaleStatus();

if (result.isErr()) {
  const error = result.error;
  const message = TailscaleApiError.is(error) ? error.message : error.message;
  console.error("Failed to get Tailscale status:", message);
  console.error("\nMake sure:");
  console.error("  1. Tailscale is installed and running");
  console.error("  2. The socket exists at", TAILSCALE_SOCKET);
  console.error("  3. You have permission to access the socket");
  process.exit(1);
}

const status = result.value;

console.log(
  `Tailscale v${status.Version} - Backend: ${status.BackendState}\n`,
);

console.log("📱 This device:");
console.log(`   ${status.Self.DNSName}`);
console.log(`   IPs: ${status.Self.TailscaleIPs.join(", ")}\n`);

const peers = Object.values(status.Peer);
console.log(`🌐 ${peers.length} peer device(s):\n`);

for (const peer of peers) {
  const onlineStatus = peer.Online ? "● Online" : "○ Offline";
  const user = status.User[peer.UserID]?.DisplayName || "Unknown";

  console.log(`   ${peer.DNSName}`);
  console.log(`   IPs: ${peer.TailscaleIPs.join(", ")}`);
  console.log(`   Host: ${peer.HostName} | OS: ${peer.OS}`);
  console.log(`   User: ${user} | ${onlineStatus}`);

  if (peer.Tags && peer.Tags.length > 0) {
    console.log(`   Tags: ${peer.Tags.join(", ")}`);
  }

  if (peer.LastSeen) {
    const lastSeen = new Date(peer.LastSeen);
    console.log(`   Last seen: ${lastSeen.toLocaleString()}`);
  }

  console.log();
}
