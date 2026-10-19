import type { NotificationCategory } from "./categories.js";
import type { PlayerId } from "./types.js";

/** Kind of notification shown to the player (drives icon/title on the client). */
export type NotificationType =
  | "LEVEL_UP"
  | "ITEM_ACQUIRED"
  | "CHALLENGE_COMPLETED"
  | "PVP_ATTACKED"
  | "PVP_DEFEATED"
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "NEW_FOLLOWER";

export type NotificationMetadata = Readonly<Record<string, string | number | boolean>>;

export interface NotificationProps {
  readonly id: string;
  readonly userId: PlayerId;
  readonly type: NotificationType;
  readonly category: NotificationCategory;
  readonly title: string;
  readonly message: string;
  readonly createdAt: Date;
  readonly metadata?: NotificationMetadata;
  readonly read?: boolean;
}

/** Wire format sent to clients and returned by the API. */
export interface NotificationDTO {
  id: string;
  userId: PlayerId;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  metadata: NotificationMetadata;
  createdAt: string;
  read: boolean;
}

/**
 * The challenge says a Notification class is "provided" but none was given,
 * so this is our own version of it.
 *
 * Immutable value object: changing read state returns a new instance, so the
 * repository is the only place state changes, and nothing holding a
 * reference (a channel, a caller of listFor) can alter what is stored.
 */
export class Notification {
  readonly id: string;
  readonly userId: PlayerId;
  readonly type: NotificationType;
  readonly category: NotificationCategory;
  readonly title: string;
  readonly message: string;
  readonly createdAt: Date;
  readonly metadata: NotificationMetadata;
  readonly read: boolean;

  constructor(props: NotificationProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.type = props.type;
    this.category = props.category;
    this.title = props.title;
    this.message = props.message;
    this.createdAt = new Date(props.createdAt.getTime());
    this.metadata = Object.freeze({ ...props.metadata });
    this.read = props.read ?? false;
    Object.freeze(this);
  }

  withReadState(read: boolean): Notification {
    return read === this.read ? this : new Notification({ ...this, read });
  }

  toJSON(): NotificationDTO {
    return {
      id: this.id,
      userId: this.userId,
      type: this.type,
      category: this.category,
      title: this.title,
      message: this.message,
      metadata: this.metadata,
      createdAt: this.createdAt.toISOString(),
      read: this.read,
    };
  }
}
