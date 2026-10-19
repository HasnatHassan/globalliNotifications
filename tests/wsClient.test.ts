import { describe, expect, it } from "vitest";
import { WebSocketNotificationClient } from "../src/clients/WebSocketNotificationClient.js";
import { Notification } from "../src/domain/Notification.js";
import { at } from "./helpers/fixtures.js";

const n = new Notification({ id: "n1", userId: 1, type: "LEVEL_UP", category: "GAME", title: "t", message: "m", createdAt: at });

describe("WebSocketNotificationClient", () => {
  it("reports delivered when the player has a connection", () => {
    expect(new WebSocketNotificationClient({ sendTo: () => 2 }).deliver(n)).toBe("delivered");
  });

  it("reports recipient-offline when the player has none", () => {
    expect(new WebSocketNotificationClient({ sendTo: () => 0 }).deliver(n)).toBe("recipient-offline");
  });
});
