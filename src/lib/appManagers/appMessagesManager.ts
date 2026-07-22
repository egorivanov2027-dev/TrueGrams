/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type {ApiFileManager} from '@appManagers/apiFileManager';
import type {MediaSize} from '@helpers/mediaSize';
import type {Progress} from '@lib/appDownloadManager';
import type {VIDEO_MIME_TYPE} from '@environment/videoMimeTypesSupport';
import type {Mirrors} from '@lib/apiManagerProxy';
import LazyLoadQueueBase from '@components/lazyLoadQueueBase';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import tsNow from '@helpers/tsNow';
import {nextRandomUint, randomLong} from '@helpers/random';
import {Chat, ChatFull, Dialog as MTDialog, DialogPeer, DocumentAttribute, InputMedia, InputMessage, InputMessageReadMetric, InputPeerNotifySettings, InputSingleMedia, Message, MessageAction, MessageEntity, MessageFwdHeader, MessageMedia, MessageReplies, MessageReplyHeader, MessagesDialogs, MessagesFilter, MessagesMessages, MethodDeclMap,  PeerNotifySettings, PhotoSize, SendMessageAction, Update, Photo, Updates, ReplyMarkup, InputPeer, InputPhoto, InputDocument, WebPage, GeoPoint, InputChannel, InputDialogPeer, ReactionCount, MessagePeerReaction, MessagesSearchCounter, Peer, MessageReactions, Document, InputFile, Reaction, ForumTopic as MTForumTopic, MessagesForumTopics, MessagesGetReplies, MessagesGetHistory, MessagesAffectedHistory,  MessagesTranscribedAudio, ReadParticipantDate, WebDocument, MessagesSearch, MessagesSearchGlobal, InputReplyTo, MessagesSendMessage, MessagesSendMedia, MessagesGetSavedHistory, MessagesSavedDialogs, SavedDialog as MTSavedDialog, User, MissingInvitee, TextWithEntities, ChannelsSearchPosts, FactCheck, MessageExtendedMedia, SponsoredMessage, MessagesSponsoredMessages, InputGroupCall, TodoItem, TodoCompletion, SearchPostsFlood,  MessagesDeleteSavedHistory, ChannelsDeleteParticipantHistory, MessagesDeleteHistory, MessagesDeleteTopicHistory, RichMessage} from '@layer';
import {ArgumentTypes, InvokeApiOptions, Modify} from '@types';
import {logger, LogTypes} from '@lib/logger';
import {ReferenceContext} from '@lib/storages/references';
import {AnyDialog, FilterType, GLOBAL_FOLDER_ID} from '@lib/storages/dialogs';
import {ChatRights} from '@appManagers/appChatsManager';
import {MyDocument} from '@appManagers/appDocsManager';
import {MyPhoto} from '@appManagers/appPhotosManager';
import DEBUG from '@config/debug';
import SlicedArray, {Slice, SliceEnd} from '@helpers/slicedArray';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, GENERAL_TOPIC_ID, HIDDEN_PEER_ID, MESSAGES_ALBUM_MAX_SIZE, MUTE_UNTIL, NULL_PEER_ID, REAL_FOLDERS, REAL_FOLDER_ID, REPLIES_HIDDEN_CHANNEL_ID, REPLIES_PEER_ID, SERVICE_PEER_ID, TEST_NO_SAVED, THUMB_TYPE_FULL, TOPIC_COLORS} from '@appManagers/constants';
import {getMiddleware} from '@helpers/middleware';
import assumeType from '@helpers/assumeType';
import copy from '@helpers/object/copy';
import getObjectKeysAndSort from '@helpers/object/getObjectKeysAndSort';
import forEachReverse from '@helpers/array/forEachReverse';
import deepEqual from '@helpers/object/deepEqual';
import splitStringByLength from '@helpers/string/splitStringByLength';
import sliceMessageEntities from '@helpers/sliceMessageEntities';
import debounce from '@helpers/schedulers/debounce';
import {AppManager} from '@appManagers/manager';
import getPhotoMediaInput from '@appManagers/utils/photos/getPhotoMediaInput';
import parseMarkdown from '@lib/richTextProcessor/parseMarkdown';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import filterMessagesByInputFilter from '@appManagers/utils/messages/filterMessagesByInputFilter';
import ctx from '@environment/ctx';
import {getEnvironment} from '@environment/utils';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import defineNotNumerableProperties from '@helpers/object/defineNotNumerableProperties';
import getDocumentMediaInput from '@appManagers/utils/docs/getDocumentMediaInput';
import getFileNameForUpload from '@helpers/getFileNameForUpload';
import noop from '@helpers/noop';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import getGroupedText from '@appManagers/utils/messages/getGroupedText';
import pause from '@helpers/schedulers/pause';
import makeError from '@helpers/makeError';
import getStickerEffectThumb from '@appManagers/utils/stickers/getStickerEffectThumb';
import getDocumentInput from '@appManagers/utils/docs/getDocumentInput';
import reactionsEqual from '@appManagers/utils/reactions/reactionsEqual';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {BroadcastEvents} from '@lib/rootScope';
import setBooleanFlag from '@helpers/object/setBooleanFlag';
import getMessageThreadId from '@appManagers/utils/messages/getMessageThreadId';
import callbackify from '@helpers/callbackify';
import wrapMessageEntities from '@lib/richTextProcessor/wrapMessageEntities';
import isLegacyMessageId from '@appManagers/utils/messageId/isLegacyMessageId';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import insertInDescendSortedArray from '@helpers/array/insertInDescendSortedArray';
import {LOCAL_ENTITIES} from '@lib/richTextProcessor';
import {isDialog, isSavedDialog, isForumTopic, isMonoforumDialog} from '@appManagers/utils/dialogs/isDialog';
import getDialogKey from '@appManagers/utils/dialogs/getDialogKey';
import getHistoryStorageKey, {getSearchStorageFilterKey} from '@appManagers/utils/messages/getHistoryStorageKey';
import {ApiLimitType} from '@appManagers/apiManagerMethods';
import getFwdFromName from '@appManagers/utils/messages/getFwdFromName';
import filterUnique from '@helpers/array/filterUnique';
import getSearchType from '@appManagers/utils/messages/getSearchType';
import getMainGroupedMessage from '@appManagers/utils/messages/getMainGroupedMessage';
import getUnreadReactions from '@appManagers/utils/messages/getUnreadReactions';
import isMentionUnread from '@appManagers/utils/messages/isMentionUnread';
import canMessageHaveFactCheck from '@appManagers/utils/messages/canMessageHaveFactCheck';
import PaidMessagesQueue from '@appManagers/utils/messages/paidMessagesQueue';
import type {ConfirmedPaymentResult} from '@components/chat/paidMessagesInterceptor';
import RepayRequestHandler, {RepayRequest} from '@appManagers/utils/repayRequestHandler';
import getPhotoInput from '@appManagers/utils/photos/getPhotoInput';
import {BatchProcessor} from '@helpers/sortedList';
import {increment, MonoforumDialog} from '@lib/storages/monoforumDialogs';
import formatStarsAmount from '@appManagers/utils/payments/formatStarsAmount';
import {makeMessageMediaInputForSuggestedPost} from '@appManagers/utils/messages/makeMessageMediaInput';
import createObservedState, {wrapObject} from '@helpers/createObservedState';
import createHistoryStorage, {createHistoryStorageSearchSlicedArray} from '@appManagers/utils/messages/createHistoryStorage';
import {isTempId} from '@appManagers/utils/messages/isTempId';
import fitSymbols from '@helpers/string/fitSymbols';
import isObject from '@helpers/object/isObject';
import pickKeys from '@helpers/object/pickKeys';
import namedPromises from '@helpers/namedPromises';
import callbackifyAll from '@helpers/callbackifyAll';
import {createBotforumTopicFromAction} from './utils/dialogs/createBotforumTopicFromAction';
import {AttachedMedia, CreatePollPayload} from '@components/popups/createPoll/storeContext';
import {isVaultEnabled, saveDeletedMessage, saveEditedMessage} from '@lib/truegram/deletedVault';

// console.trace('include');
// TODO: если удалить диалог находясь в папке, то он не удалится из папки и будет виден в настройках

const DO_NOT_READ_HISTORY = false;
const DO_NOT_SEND_MESSAGES = false;
const SEND_MESSAGES_TO_PAID_QUEUE = false;
const DO_NOT_DELETE_MESSAGES = false;
const FETCH_TARGETED_MESSAGE = false;

const GLOBAL_HISTORY_PEER_ID = NULL_PEER_ID;
const TOPIC_TITLE_MAX_LENGTH = 16;
const TOPIC_TITLE_DEFAULT = 'New Chat';

export const SUGGESTED_POST_MIN_THRESHOLD_SECONDS = 60; // avoid last minute suggests, or if the user was thinking a lot before clicking send

export enum HistoryType {
  Chat,
  Thread,
  Topic,
  Saved,
  Monoforum
};

export type SendFileDetails = {
  file: File | Blob | MyDocument,
} & Partial<{
  duration: number,
  width: number,
  height: number,
  objectURL: string,
  thumb: {
    isCover?: boolean;

    blob: Blob,
    url: string,
    size: MediaSize
  },
  strippedBytes: PhotoSize.photoStrippedSize['bytes'],
  spoiler: boolean,
  /**
   * If it's a GIF (looped)
   */
  isAnimated: boolean,
}>;

export type HistoryStorageKey = `${HistoryStorage['type']}_${PeerId}` | `replies_${PeerId}_${number}` | `search_${PeerId}_${SearchStorageFilterKey}_${number}`;
export type HistoryStorage = {
  _maxId: number,
  count: number | null,
  history?: SlicedArray<number>,
  searchHistory?: SlicedArray<`${PeerId}_${number}`>,

  readonly maxId?: number,
  readPromise?: Promise<void>,
  readMaxId?: number,
  readOutboxMaxId?: number,
  triedToReadMaxId?: number,

  maxOutId?: number,
  replyMarkup?: Exclude<ReplyMarkup, ReplyMarkup.replyInlineMarkup>,

  readonly type: 'history' | 'replies' | 'search',
  key: HistoryStorageKey,
  wasFetched?: boolean;

  channelJoinedMid?: number,
  originalInsertSlice?: SlicedArray<number>['insertSlice'],

  // * for search
  filterMessages?: (messages: MyMessage[]) => MyMessage[],
  filterMessage?: (message: MyMessage) => boolean,
  onMidInsertion?: (mid: number) => void,
  nextRate?: number,
};

export type HistoryResult = {
  count: number,
  history: number[],
  isEnd: ReturnType<Slice<number>['getEnds']>,
  offsetIdOffset?: number,
  nextRate?: number,
  messages?: MyMessage[],
  flood?: SearchPostsFlood
};

export type Dialog = MTDialog.dialog;
export type ForumTopic = MTForumTopic.forumTopic;
export type SavedDialog = MTSavedDialog.savedDialog;

export type MyMessage = Message.message | Message.messageService;
export type MyInputMessagesFilter = 'inputMessagesFilterEmpty'
  | 'inputMessagesFilterPhotos'
  | 'inputMessagesFilterPhotoVideo'
  | 'inputMessagesFilterVideo'
  | 'inputMessagesFilterDocument'
  | 'inputMessagesFilterVoice'
  | 'inputMessagesFilterRoundVoice'
  | 'inputMessagesFilterRoundVideo'
  | 'inputMessagesFilterMusic'
  | 'inputMessagesFilterUrl'
  | 'inputMessagesFilterMyMentions'
  | 'inputMessagesFilterChatPhotos'
  | 'inputMessagesFilterPinned';

export type PinnedStorage = Partial<{
  promise: Promise<PinnedStorage>,
  count: number,
  maxId: number
}>;
export type MessagesStorage = Map<number, Message.message | Message.messageService> & {peerId: PeerId, type: MessagesStorageType, key: MessagesStorageKey};
export type MessagesStorageType = 'scheduled' | 'history' | 'grouped' | 'logs';
export type MessagesStorageKey = `${PeerId}_${MessagesStorageType}`;

export type MyMessageActionType = Message.messageService['action']['_'];

type PendingAfterMsg = Partial<InvokeApiOptions & {
  afterMessageId: string,
  messageId: string
}>;

type MapValueType<A> = A extends Map<any, infer V> ? V : never;

export type BatchUpdates = {
  'messages_reactions': AppMessagesManager['batchUpdateReactions'],
  'messages_views': AppMessagesManager['batchUpdateViews']
};

type PendingMessageDetails = {
  peerId: PeerId,
  tempId: number,
  threadId: number,
  storage: MessagesStorage,
  sequential?: boolean
};

const processAfter = (cb: () => void) => {
  // setTimeout(cb, 0);
  cb();
};

const passHistoryStorageProperties: Set<keyof HistoryStorage> = new Set([
  '_maxId',
  'count',
  'readMaxId',
  'readOutboxMaxId',
  'maxOutId',
  'replyMarkup',
  'key',
  'wasFetched'
]);

export type SuggestedPostPayload = {
  stars?: number,
  timestamp?: number,
  changeMid?: number,
  hasMedia?: boolean,
  monoforumThreadId?: PeerId
};

export type MessageSendingParams = Partial<{
  peerId: PeerId,
  threadId: number,
  replyToMsgId: number,
  replyToStoryId: number,
  replyToQuote: {text: string, entities?: MessageEntity[], offset?: number},
  replyToPollOption: Uint8Array,
  replyToPeerId: PeerId,
  replyTo: InputReplyTo,
  replyToMonoforumPeerId: PeerId,
  scheduleDate: number,
  scheduleRepeatPeriod: number,
  silent: boolean,
  sendAsPeerId: number,
  updateStickersetOrder: boolean,
  savedReaction: Reaction[],
  invertMedia: boolean,
  effect: DocId,
  confirmedPaymentResult: ConfirmedPaymentResult,
  suggestedPost: SuggestedPostPayload
}>;

export type MessageForwardParams = MessageSendingParams & {
  fromPeerId: PeerId,
  mids: number[]
} & Partial<{
  withMyScore: true,
  dropAuthor: boolean,
  dropCaptions: boolean
}>;

export type RequestHistoryOptions = {
  peerId?: PeerId,
  offsetId?: number,
  offsetPeerId?: PeerId, // to get the offset message
  limit?: number,
  addOffset?: number,
  offsetDate?: number,
  threadId?: number,
  monoforumThreadId?: PeerId,
  // search
  nextRate?: number,
  folderId?: number,
  query?: string,
  inputFilter?: {
    _: MyInputMessagesFilter,
  },
  minDate?: number,
  maxDate?: number,
  savedReaction?: (Reaction.reactionCustomEmoji | Reaction.reactionEmoji)[],
  needRealOffsetIdOffset?: boolean,
  fromPeerId?: PeerId,
  isPublicHashtag?: boolean,
  isPublicPosts?: boolean,
  allowStars?: Long,
  isCacheableSearch?: boolean,
  hashtagType?: 'this' | 'my' | 'public',
  chatType?: 'all' | 'users' | 'groups' | 'channels',
  recursion?: boolean,                  // ! FOR INNER USE ONLY
  historyType?: HistoryType,            // ! FOR INNER USE ONLY
  searchType?: 'cached' | 'uncached'    // ! FOR INNER USE ONLY
};

type GetHistoryTypeOptions = {
  threadId?: number,
  monoforumPeerId?: number
};

export type SearchStorageFilterKey = string;

type GetUnreadMentionsOptions = {
  peerId: PeerId,
  threadId?: number,
  isReaction?: boolean,
  isPollVote?: boolean
};

type UploadThumbAndCoverArgs = {
  peer: InputPeer,
  blob: Blob,
  isCover: boolean
  onUploadPromise?: (promise: CancellablePromise<InputFile>) => void
};

type UploadVideoCoverArgs = {
  peer: InputPeer,
  file: InputFile
};

type ReadHistoryArgs = {
  peerId: PeerId,
  maxId?: number,
  threadId?: number,
  monoforumThreadId?: PeerId,
  force?: boolean
};

type MarkDialogUnreadArgs = {
  peerId: PeerId,
  read?: boolean,
  monoforumThreadId?: PeerId
};

type FlushHistoryArgs = {
  peerId: PeerId,
  justClear?: boolean,
  revoke?: boolean,
  threadOrSavedId?: number,
  monoforumThreadId?: PeerId,
  // Date-range delete bounds (unix seconds, inclusive). Honoured ONLY for the
  // user-peer branch (`messages.deleteHistory`); ignored elsewhere because
  // `channels.deleteHistory` and friends don't accept date params.
  minDate?: number,
  maxDate?: number
};

type DoFlushHistoryArgs = {
  peerId: PeerId,
  justClear?: boolean,
  revoke?: boolean,
  threadOrSavedId?: number,
  monoforumThreadId?: PeerId,
  participantPeerId?: PeerId,
  minDate?: number,
  maxDate?: number,
  recursion?: boolean
};

type SendContactArgs = {
  peerId: PeerId,
  monoforumThreadId?: PeerId,
  contactPeerId: PeerId,
  confirmedPaymentResult?: ConfirmedPaymentResult
};

type GenerateTopicCreatedServiceMessageArgs = {
  peerId: PeerId,
  title: string
};

type CreateBotforumTopicArgs = {
  peerId: PeerId,
  title: string,
  tempId: number,
  randomId: string,
  message: ReturnType<AppMessagesManager['generateTopicCreatedServiceMessage']>,
  iconColor?: number
};

type GetPendingOrCreateBotforumTopicArgs = {
  peerId: PeerId,
  title?: string
};

type GenerateTypingBotforumMessageArgs = {
  peerId: PeerId,
  threadId: number,
  action: SendMessageAction.sendMessageTextDraftAction
};

type SendFileArgs = MessageSendingParams & SendFileDetails & Partial<{
  isRoundMessage: boolean,
  isVoiceMessage: boolean,
  isGroupedItem: boolean,
  isMedia: boolean,

  groupId: string,
  caption: string,
  entities: MessageEntity[],
  background: boolean,
  clearDraft: boolean,
  noSound: boolean,

  waveform: Uint8Array,

  stars: number,
  groupedMessage: Message.message,
  useTempMediaId: boolean,

  // ! only for internal use
  processAfter?: typeof processAfter
}>;

type MakeDocumentAndMetaForSendingFileArgs = Pick<SendFileArgs,
  | 'file'
  | 'strippedBytes'
  | 'entities'
  | 'useTempMediaId'
  | 'isVoiceMessage'
  | 'width'
  | 'height'
  | 'objectURL'
  | 'waveform'
  | 'duration'
  | 'isMedia'
  | 'isRoundMessage'
  | 'noSound'
  | 'thumb'
  | 'isAnimated'
> & {
  mediaTempId: number;
  isDocument: boolean;
};

type EditMessageMediaArgs = {
  message: Message.message;
  text: string;
  sendFileDetails: SendFileDetails;
  options?: Partial<{
    newMedia: InputMedia;
    scheduleDate: number;
    entities: MessageEntity[];
    isMedia: boolean;
  }> & Partial<Pick<Parameters<AppMessagesManager['sendText']>[0], 'webPage' | 'webPageOptions' | 'noWebPage' | 'invertMedia'>>
};

type MakeMediaUploadDeferredArgs = Pick<SendFileDetails, 'file'>;

type SyncSentAndUploadPromisesArgs = {
  sentDeferred: CancellablePromise<any>;
  uploadFileDeferred: CancellablePromise<any>;
  file: File | Blob;
};

type UploadMediaFileArgs =
  Pick<SendFileDetails, 'objectURL' | 'thumb' | 'spoiler'>
  &
  Pick<ReturnType<AppMessagesManager['makeDocumentAndMetaForSendingFile']>, 'fileType' | 'apiFileName' | 'attachType' | 'attributes' | 'actionName'>
  &
  {
    peerId: PeerId;
    uploadingFileName: string;
    file: File | Blob;

    onUploadDeferred?: (deferred: CancellablePromise<any>) => void;
    onThumbnailUploadDeferred?: (deferred: CancellablePromise<any>) => void;
  };

type InvokeEditMessageMediaArgs = {
  message: Message.message;
  inputMedia: InputMedia;
  entities?: MessageEntity[];
  scheduleDate?: number;
  invertMedia?: boolean;
};

type MessageContext = {searchStorages?: Set<HistoryStorage>};

export class AppMessagesManager extends AppManager {
  private messagesStorageByPeerId: {[peerId: string]: MessagesStorage};
  private groupedMessagesStorage: {[groupId: string]: MessagesStorage}; // will be used for albums
  private scheduledMessagesStorage: {[peerId: PeerId]: MessagesStorage};
  private logsMessagesStorage: {[peerId: PeerId]: MessagesStorage}; // messages extracted from admin logs

  private historiesStorage: {
    [peerId: PeerId]: HistoryStorage
  };
  private threadsStorage: {
    [peerId: PeerId]: {
      [threadId: string]: HistoryStorage
    }
  };
  private searchesStorage: {
    [peerId: PeerId]: {
      [threadId: string]: {
        [inputFilter in SearchStorageFilterKey]?: HistoryStorage
      }
    }
  } & {[key: HistoryStorageKey]: HistoryStorage};
  private pinnedMessages: {[key: string]: PinnedStorage};
  private references: {[key: string]: MessageContext};

  private threadsServiceMessagesIdsStorage: {[peerId_threadId: string]: number};
  private threadsToReplies: {
    [peerId_threadId: string]: string;
  };

  private pendingByRandomId: {
    [randomId: string]: PendingMessageDetails
  } = {};
  private pendingByMessageId: {[mid: string]: Long} = {};
  private pendingAfterMsgs: {[peerId: PeerId]: PendingAfterMsg} = {};
  public pendingTopMsgs: {[peerId in PeerId | `${PeerId}_${number}`]: number} = {};
  private tempFinalizeCallbacks: {
    [tempId: string]: {
      [callbackName: string]: Partial<{
        deferred: CancellablePromise<void>,
        callback: (message: MyMessage) => Promise<any>
      }>
    }
  } = {};

  private pendingNewBotforumTopics: Record<PeerId, {
    newId?: number;
    tempId: number;
    beforeMessageSendCallbacks: Array<() => void>;
    messageSendCallbacks: Array<() => void>;
  }> = {};

  public sendSmthLazyLoadQueue = new LazyLoadQueueBase(10);

  private needSingleMessages: Map<PeerId, Map<number, CancellablePromise<Message.message | Message.messageService>>> = new Map();
  private fetchSingleMessagesPromise: Promise<void>;
  private extendedMedia: Map<PeerId, Map<number, CancellablePromise<void>>> = new Map();
  private richMessages: Map<string, Promise<RichMessage | undefined>> = new Map();

  private deletedMessages: Set<string> = new Set();

  private maxSeenId = 0;

  public migratedFromTo: {[peerId: PeerId]: PeerId} = {};
  public migratedToFrom: {[peerId: PeerId]: PeerId} = {};

  private newDialogsHandlePromise: Promise<any>;
  public newDialogsToHandle: Map<PeerId, {dialog?: Dialog, topics?: Map<number, ForumTopic>, saved?: Map<number, SavedDialog>}> = new Map();
  public newUpdatesAfterReloadToHandle: {[key: string]: Set<Update>} = {};

  private notificationsHandlePromise: number;
  private notificationsToHandle: {[key: string]: {
    fwdCount: number,
    fromId: PeerId,
    topMessage?: MyMessage
  }} = {};

  private reloadConversationsPromise: Promise<void>;
  private reloadConversationsPeers: Map<PeerId, {inputDialogPeer: InputDialogPeer, promise: CancellablePromise<Dialog>, sentRequest?: boolean}> = new Map();

  private groupedTempId = 0;
  private mediaTempId = 0;
  private mediaTempMap: {[tempId: number]: number} = {};

  private typings: {[key: string]: {action: SendMessageAction, timeout?: number}} = {};

  private middleware: ReturnType<typeof getMiddleware>;

  private unreadMentions: {[key: string]: SlicedArray<number>} = {};
  private goToNextMentionPromises: {[key: string]: Promise<number>} = {};

  private batchUpdates: {
    [k in keyof BatchUpdates]?: {
      callback: BatchUpdates[k],
      batch: ArgumentTypes<BatchUpdates[k]>[0]
    }
  } = {};
  private batchUpdatesDebounced: () => Promise<void>;

  private uploadFilePromises: {[fileName: string]: CancellablePromise<any>};

  private tempMids: {[peerId: PeerId]: number} = {};

  private historyMaxIdSubscribed: Map<HistoryStorageKey, number> = new Map();

  private factCheckBatcher: Batcher<PeerId, number, FactCheck>;
  private checklistBatcher: Batcher<string, { taskId: number, oldItem?: TodoCompletion, action: 'complete' | 'uncomplete' }, void>;

  private waitingTranscriptions: Map<string, CancellablePromise<MessagesTranscribedAudio>>;
  private paidMessagesQueue = new PaidMessagesQueue;

  public repayRequestHandler: RepayRequestHandler;

  private typingBotforumMessages: Map<PeerId, Set<string>> = new Map();

  private pendingEditingMessages: Map<number, {
    canceled?: boolean;
    mediaTempId: number;
    originalMessage: Message.message;
  }> = new Map();

  constructor() {
    super();
    this.name = 'MESSAGES';
    this.logTypes = LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn;
  }

  protected after() {
    this.clear(true);

    this.repayRequestHandler = new RepayRequestHandler({
      rootScope: this.rootScope
    });

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateMessageID: this.onUpdateMessageId,

      updateNewDiscussionMessage: this.onUpdateNewMessage,
      updateNewMessage: this.onUpdateNewMessage,
      updateNewChannelMessage: this.onUpdateNewMessage,

      updateDialogUnreadMark: this.onUpdateDialogUnreadMark,

      updateEditMessage: this.onUpdateEditMessage,
      updateEditChannelMessage: this.onUpdateEditMessage,

      updateMessageReactions: this.onUpdateMessageReactions,

      updateReadChannelDiscussionInbox: this.onUpdateReadHistory,
      updateReadChannelDiscussionOutbox: this.onUpdateReadHistory,
      updateReadHistoryInbox: this.onUpdateReadHistory,
      updateReadHistoryOutbox: this.onUpdateReadHistory,
      updateReadChannelInbox: this.onUpdateReadHistory,
      updateReadChannelOutbox: this.onUpdateReadHistory,
      updateReadMonoForumInbox: this.onUpdateReadHistory,
      updateReadMonoForumOutbox: this.onUpdateReadHistory,

      updateChannelReadMessagesContents: this.onUpdateReadMessagesContents,
      updateReadMessagesContents: this.onUpdateReadMessagesContents,

      updateChannelAvailableMessages: this.onUpdateChannelAvailableMessages,

      updateDeleteMessages: this.onUpdateDeleteMessages,
      updateDeleteChannelMessages: this.onUpdateDeleteMessages,

      updateChannel: this.onUpdateChannel,

      updateChannelReload: this.onUpdateChannelReload,

      updateChannelMessageViews: this.onUpdateChannelMessageViews,

      updateServiceNotification: this.onUpdateServiceNotification,

      updatePinnedMessages: this.onUpdatePinnedMessages,
      updatePinnedChannelMessages: this.onUpdatePinnedMessages,

      updateNotifySettings: this.onUpdateNotifySettings,

      updateNewScheduledMessage: this.onUpdateNewScheduledMessage,

      updateDeleteScheduledMessages: this.onUpdateDeleteScheduledMessages,

      updateMessageExtendedMedia: this.onUpdateMessageExtendedMedia,

      updateTranscribedAudio: this.onUpdateTranscribedAudio
    });

    // ! Invalidate notify settings, can optimize though
    this.rootScope.addEventListener('notify_peer_type_settings', ({key, settings}) => {
      const dialogs = this.dialogsStorage.getFolderDialogs(0).concat(this.dialogsStorage.getFolderDialogs(1)) as Dialog[];
      let filterFunc: (dialog: typeof dialogs[0]) => boolean;
      if(key === 'notifyUsers') filterFunc = (dialog) => dialog.peerId.isUser();
      else if(key === 'notifyBroadcasts') filterFunc = (dialog) => this.appPeersManager.isBroadcast(dialog.peerId);
      else filterFunc = (dialog) => this.appPeersManager.isAnyGroup(dialog.peerId);

      dialogs
      .filter(filterFunc)
      .forEach((dialog) => {
        this.rootScope.dispatchEvent('dialog_notify_settings', dialog);
      });
    });

    this.rootScope.addEventListener('webpage_updated', ({id, msgs}) => {
      msgs.forEach(({peerId, mid, isScheduled}) => {
        const storage = isScheduled ? this.getScheduledMessagesStorage(peerId) : this.getHistoryMessagesStorage(peerId);
        const message = this.getMessageFromStorage(storage, mid) as Message.message;
        if(!message) {
          return;
        }

        this.modifyMessage(message, (message) => {
          message.media = {
            _: 'messageMediaWebPage',
            pFlags: {},
            ...(message.media as MessageMedia.messageMediaWebPage || {}),
            webpage: this.appWebPagesManager.getCachedWebPage(id)
          };
        }, storage);

        this.rootScope.dispatchEvent('message_edit', {
          storageKey: storage.key,
          peerId,
          mid,
          message
        });
      });
    });

    this.rootScope.addEventListener('draft_updated', ({peerId, threadId, monoforumThreadId, draft}) => {
      if(monoforumThreadId) {
        const dialog = this.monoforumDialogsStorage.getDialogByParent(peerId, monoforumThreadId);

        if(!dialog) return;

        dialog.draft = draft;
        this.monoforumDialogsStorage.updateDialogIndex(dialog);

        this.rootScope.dispatchEvent('monoforum_draft_update', {dialog});

        return;
      }

      const dialog = this.dialogsStorage.getAnyDialog(peerId, threadId) as Dialog | ForumTopic;
      if(dialog) {
        dialog.draft = draft;

        let drop = false;
        if(!draft && !getServerMessageId(dialog.top_message)) {
          this.dialogsStorage.dropDialog(peerId);
          drop = true;
        } else {
          this.dialogsStorage.generateIndexForDialog(dialog);
          this.dialogsStorage.pushDialog({dialog});
        }

        this.rootScope.dispatchEvent('dialog_draft', {
          peerId,
          dialog,
          drop,
          draft
        });
      } else if(threadId) {
        const chat = this.appChatsManager.getChat(peerId.toChatId());
        if(!chat) {
          this.reloadConversation(peerId);
        } else if((chat as Chat.channel).pFlags.forum) {
          this.dialogsStorage.getForumTopicById(peerId, threadId);
        }
      } else {
        this.reloadConversation(peerId);
      }
    });

    this.rootScope.addEventListener('poll_update', ({poll}) => {
      const set = this.appPollsManager.pollToMessages[poll.id];
      if(!set) {
        return;
      }

      for(const key of set) {
        const [peerId, mid] = key.split('_');

        const message = this.getMessageByPeer(peerId.toPeerId(), +mid);
        if(message) {
          this.onMessageModification(message);
          this.setDialogToStateIfMessageIsTop(message);
        }
      }
    });

    // * clear forum cache
    this.rootScope.addEventListener('chat_toggle_forum', ({chatId, enabled}) => {
      const peerId = chatId.toPeerId(true);
      if(!enabled) {
        delete this.threadsStorage[peerId];

        for(const key in this.pinnedMessages) {
          if(+key === peerId && key.startsWith(peerId + '_')) {
            delete this.pinnedMessages[key];
          }
        }
      }
    });

    this.rootScope.addEventListener('dialog_drop', (dialog) => {
      if(isDialog(dialog)) {
        this.flushStoragesByPeerId(dialog.peerId);
      }
    });

    this.batchUpdatesDebounced = debounce(() => {
      for(const event in this.batchUpdates) {
        const details = this.batchUpdates[event as keyof BatchUpdates];
        delete this.batchUpdates[event as keyof BatchUpdates];

        // @ts-ignore
        const result = details.callback(details.batch);
        if(result && (!(result instanceof Array) || result.length)) {
          this.rootScope.dispatchEvent(event as keyof BatchUpdates, result as any);
        }
      }
    }, 33, false, true);

    this.factCheckBatcher = new Batcher({
      processBatch: this.processFactCheckBatch
    });

    this.checklistBatcher = new Batcher({
      delay: 500,
      debounce: true,
      processBatch: this.processChecklistBatch
    });

    return this.appStateManager.getState().then((state) => {
      if(state.maxSeenMsgId) {
        this.maxSeenId = state.maxSeenMsgId;
      }
    });
  }

  public clear = (init?: boolean) => {
    if(this.middleware) {
      this.middleware.clean();
      this.waitingTranscriptions.forEach((promise) => promise.reject());
    } else {
      this.middleware = getMiddleware();
      this.uploadFilePromises = {};
    }

    this.messagesStorageByPeerId = {};
    this.groupedMessagesStorage = {};
    this.scheduledMessagesStorage = {};
    this.logsMessagesStorage = {};
    this.historiesStorage = {};
    this.threadsStorage = {};
    this.searchesStorage = {};
    this.pinnedMessages = {};
    this.threadsServiceMessagesIdsStorage = {};
    this.threadsToReplies = {};
    this.references = {};
    this.waitingTranscriptions = new Map();
    this.pendingNewBotforumTopics = {};
    this.pendingEditingMessages = new Map();

    if(!init) {
      this.appProfileManager.clearBotCommands();
    }

    this.dialogsStorage && this.dialogsStorage.clear(init);
    this.filtersStorage && this.filtersStorage.clear(init);
  };

  public getInputEntities(entities: MessageEntity[]) {
    const sendEntities = copy(entities);
    forEachReverse(sendEntities, (entity, idx, arr) => {
      if(LOCAL_ENTITIES.has(entity._)) {
        arr.splice(idx, 1);
      } else if(entity._ === 'messageEntityMentionName') {
        (entity as any as MessageEntity.inputMessageEntityMentionName)._ = 'inputMessageEntityMentionName';
        (entity as any as MessageEntity.inputMessageEntityMentionName).user_id = this.appUsersManager.getUserInput(entity.user_id);
      }
    });

    if(!sendEntities.length) {
      return;
    }

    return sendEntities;
  }

  public invokeAfterMessageIsSent(tempId: number, callbackName: string, callback: (message: MyMessage) => Promise<any>) {
    const finalize = this.tempFinalizeCallbacks[tempId] ??= {};
    const obj = finalize[callbackName] ??= {deferred: deferredPromise<void>()};

    obj.callback = callback;

    return obj.deferred;
  }

  public editMessage(
    message: MyMessage,
    text: string,
    options: Partial<{
      newMedia: InputMedia,
      scheduleDate: number,
      scheduleRepeatPeriod: number,
      entities: MessageEntity[]
    }> & Partial<Pick<Parameters<AppMessagesManager['sendText']>[0], 'webPage' | 'webPageOptions' | 'noWebPage' | 'invertMedia'>> = {}
  ): Promise<void> {
    /* if(!this.canEditMessage(messageId)) {
      return Promise.reject({type: 'MESSAGE_EDIT_FORBIDDEN'});
    } */

    const {mid, peerId} = message;

    if(message.pFlags.is_outgoing) {
      return this.invokeAfterMessageIsSent(mid, 'edit', (message) => {
        // this.log('invoke editMessage callback', message);
        return this.editMessage(message, text, options);
      });
    }

    let entities = options.entities || [];
    if(text) {
      [text, entities] = parseMarkdown(text, entities);
    }

    const sendEntities = this.getInputEntities(entities);

    const inputMediaWebPage = this.getInputMediaWebPage(options);

    const schedule_date = options.scheduleDate || ((message as Message.message).pFlags.is_scheduled ? message.date : undefined);
    return this.apiManager.invokeApi('messages.editMessage', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: message.id,
      message: text,
      media: options.newMedia,
      entities: sendEntities,
      no_webpage: options.noWebPage,
      schedule_date,
      schedule_repeat_period: options.scheduleRepeatPeriod || undefined,
      invert_media: options.invertMedia,
      ...(inputMediaWebPage ? {media: inputMediaWebPage} : {})
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    }, (error: ApiError) => {
      this.log.error('editMessage error:', error);

      if(error?.type === 'MESSAGE_NOT_MODIFIED') {
        error.handled = true;
        return;
      }

      if(error?.type === 'MESSAGE_EMPTY') {
        error.handled = true;
      }

      throw error;
    });
  }

  public async editMessageMedia({message, text, sendFileDetails, options = {}}: EditMessageMediaArgs) {
    let {file} = sendFileDetails;
    const {peerId} = message;

    const originalMessage = structuredClone(message);

    const isDocument = !(file instanceof File) && !(file instanceof Blob);
    if(isDocument) {
      file = this.appDocsManager.getDoc((file as MyDocument).id) || file;
    }

    let caption = text || '';

    let entities = options.entities || [];
    if(caption) {
      [caption, entities] = parseMarkdown(caption, entities);
    }

    const mediaTempId = this.mediaTempId++;

    const {photo, document, attachType, actionName, fileType, apiFileName, attributes} = this.makeDocumentAndMetaForSendingFile({
      file,
      isDocument,
      mediaTempId,
      entities,
      isMedia: options.isMedia,
      ...pickKeys(sendFileDetails, [
        'strippedBytes',
        'width',
        'height',
        'objectURL',
        'duration',
        'thumb',
        'isAnimated'
      ])
    });

    const {deferred: sentDeferred, uploadingFileName} = this.makeMediaUploadDeferred({file});

    const media: MessageMedia = isDocument ? undefined : {
      _: photo ? 'messageMediaPhoto' : 'messageMediaDocument',
      pFlags: {},
      // preloader,
      photo,
      document
    };


    if(options.invertMedia) {
      message.pFlags.invert_media = true;
    }

    message.entities = entities;
    message.message = caption;
    message.media = isDocument ? {
      _: 'messageMediaDocument',
      pFlags: {},
      document: file
    } as MessageMedia.messageMediaDocument : media;
    message.uploadingFileName = [uploadingFileName];

    const upload = () => {
      if(isDocument) {
        const inputMedia: InputMedia = {
          _: 'inputMediaDocument',
          id: getDocumentInput(file as MyDocument),
          pFlags: {}
        };

        sentDeferred.resolve(inputMedia);
      } else if(file instanceof File || file instanceof Blob) {
        try {
          const uploadMediaPromise = this.uploadMediaFile({
            peerId,
            ...pickKeys(sendFileDetails, ['objectURL', 'thumb', 'spoiler']),
            file,
            uploadingFileName,
            fileType,
            apiFileName,
            attachType,
            attributes,
            actionName,
            onUploadDeferred: (uploadFileDeferred) => {
              this.syncSentAndUploadPromises({sentDeferred, uploadFileDeferred, file});
            }
          });

          uploadMediaPromise.then((inputMedia) => sentDeferred.resolve(inputMedia), (e) => sentDeferred.reject(e));
        } catch{
          this.revertMessageEdit(message.mid);
        }
      }

      return sentDeferred;
    };

    upload();

    this.runTempUpdateForMessageEdit(message);

    // Needs to be after the updateEditMessage event
    this.pendingEditingMessages.set(message.mid, {
      originalMessage,
      mediaTempId
    });

    const inputMedia = await sentDeferred;
    MTProtoMessagePort.getInstance<false>().invoke('log', {m: 'my-debug', inputMedia});

    const callInvoke = (message: Message.message) => this.invokeEditMessageMedia({
      message,
      inputMedia,
      entities,
      scheduleDate: options.scheduleDate,
      invertMedia: options.invertMedia
    });

    if(!message.pFlags.is_outgoing) {
      return callInvoke(message);
    }

    return this.invokeAfterMessageIsSent(message.mid, 'edit', (message) => {
      if(message?._ !== 'message') return;
      return callInvoke(message);
    });
  }

  public makeMediaUploadDeferred({file}: MakeMediaUploadDeferredArgs) {
    const deferred = deferredPromise<InputMedia>();

    const uploadingFileName = file instanceof Blob ? getFileNameForUpload(file) : undefined;
    if(uploadingFileName) {
      this.uploadFilePromises[uploadingFileName] = deferred;
    }

    return {deferred, uploadingFileName};
  }

  public syncSentAndUploadPromises({sentDeferred, uploadFileDeferred, file}: SyncSentAndUploadPromisesArgs) {
    uploadFileDeferred.addNotifyListener((progress: Progress) => {
      sentDeferred.notifyAll(progress);
    });

    sentDeferred.notifyAll({done: 0, total: file.size});
  }

  public async uploadMediaFile({peerId, file, uploadingFileName, fileType, apiFileName, attachType, attributes, objectURL, thumb, spoiler, actionName, onUploadDeferred, onThumbnailUploadDeferred}: UploadMediaFileArgs) {
    const uploadPromise = this.apiFileManager.upload({file, fileName: uploadingFileName});
    onUploadDeferred?.(uploadPromise);

    let thumbUploadPromise: ReturnType<typeof this.uploadThumbAndCover>;
    if(attachType === 'video' && objectURL && thumb?.blob) {
      thumbUploadPromise = this.uploadThumbAndCover({
        blob: thumb.blob,
        isCover: !!thumb.isCover,
        peer: this.appPeersManager.getInputPeerById(peerId),
        onUploadPromise: onThumbnailUploadDeferred
      });
    }

    const inputFile = await uploadPromise;

    (inputFile as InputFile.inputFile).name = apiFileName;

    let inputMedia: InputMedia;

    switch(attachType) {
      case 'photo':
        inputMedia = {
          _: 'inputMediaUploadedPhoto',
          file: inputFile,
          pFlags: {
            spoiler: spoiler || undefined
          }
        };
        break;

      default:
        inputMedia = {
          _: 'inputMediaUploadedDocument',
          file: inputFile,
          mime_type: fileType,
          pFlags: {
            force_file: actionName === 'sendMessageUploadDocumentAction' || undefined,
            spoiler: spoiler || undefined
            // nosound_video: options.noSound ? true : undefined
          },
          attributes
        };
    }

    if(thumbUploadPromise) {
      try {
        const thumbUploadResult = await thumbUploadPromise;
        assumeType<InputMedia.inputMediaUploadedDocument>(inputMedia);

        inputMedia.thumb = thumbUploadResult.file;
        inputMedia.video_cover = thumbUploadResult.coverPhoto;
      } catch(err) {
        this.log.error('sendFile thumb upload error:', err);
      }
    }

    return inputMedia;
  }

  private runTempUpdateForMessageEdit(message: Message.message) {
    if(message.pFlags?.is_scheduled) {
      this.onUpdateNewScheduledMessage({
        _: 'updateNewScheduledMessage',
        message
      });
    } else {
      this.onUpdateEditMessage({
        _:  'updateEditMessage',
        message,
        pts: 0,
        pts_count: 0
      });
    }
  }

  private invokeEditMessageMedia({message, inputMedia, entities, scheduleDate, invertMedia}: InvokeEditMessageMediaArgs) {
    const sendEntities = this.getInputEntities(entities);

    const schedule_date = scheduleDate || (message.pFlags.is_scheduled ? message.date : undefined);
    return this.apiManager.invokeApi('messages.editMessage', {
      peer: this.appPeersManager.getInputPeerById(message.peerId),
      id: message.id,
      message: message.message,
      entities: sendEntities,
      media: inputMedia,
      schedule_date,
      invert_media: invertMedia
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    }, (error: ApiError) => {
      this.log.error('editMessage error:', error);

      this.revertMessageEdit(message.mid);

      if(error?.type === 'MESSAGE_NOT_MODIFIED') {
        error.handled = true;
        return;
      }

      if(error?.type === 'MESSAGE_EMPTY') {
        error.handled = true;
      }

      throw error;
    }).finally(() => {
      this.pendingEditingMessages.delete(message.mid);
    });
  }

  private revertMessageEdit(mid: number) {
    const pending = this.pendingEditingMessages.get(mid);
    if(!pending) return;

    pending.canceled = true;

    this.runTempUpdateForMessageEdit(pending.originalMessage);

    this.pendingEditingMessages.delete(mid);
  }

  public async transcribeAudio(message: Message.message, noPending?: boolean): Promise<MessagesTranscribedAudio> {
    const {id, peerId} = message;

    const process = (result: MessagesTranscribedAudio) => {
      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateTranscribedAudio',
        msg_id: message.id,
        peer: this.appPeersManager.getOutputPeer(peerId),
        pFlags: result.pFlags,
        text: result.text,
        transcription_id: result.transcription_id
      });

      return result;
    };

    const key = `${peerId}_${message.mid}`;
    let promise: CancellablePromise<MessagesTranscribedAudio>;
    if(noPending) {
      promise = this.waitingTranscriptions.get(key);
      if(!promise) {
        this.waitingTranscriptions.set(key, promise = deferredPromise());
        promise.finally(() => {
          this.waitingTranscriptions.delete(key);
        });
      }
    }

    const ret = this.apiManager.invokeApiSingleProcess({
      method: 'messages.transcribeAudio',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        msg_id: id
      },
      processResult: process,
      processError: (error) => {
        if(error.type === 'TRANSCRIPTION_FAILED' || error.type === 'MSG_VOICE_MISSING') {
          process({
            _: 'messages.transcribedAudio',
            transcription_id: 0,
            text: '',
            pFlags: {}
          });
        }

        throw error;
      }
    });

    return promise || ret;
  }

  private getCommonThingsForSending() {
    return namedPromises({
      config: this.apiManager.getConfig(),
      appConfig: this.apiManager.getAppConfig()
    });
  }

  public async sendText(
    options: MessageSendingParams & Partial<{
      text: string,
      entities: MessageEntity[],
      viaBotId: BotId,
      queryId: string,
      resultId: string,
      noWebPage: boolean,
      replyMarkup: ReplyMarkup,
      clearDraft: boolean,
      invertMedia: boolean,
      webPage: WebPage,
      webPageOptions: Partial<{
        largeMedia: boolean,
        smallMedia: boolean,
        optional: boolean
      }>
    }>
  ): Promise<void> {
    let {peerId, text} = options;
    if(!text.trim() && !options.suggestedPost?.changeMid) {
      return;
    }

    options.entities ??= [];
    options.webPageOptions ??= {};

    const {config, appConfig} = await this.checkSendOptions(options);

    if(appConfig.emojies_send_dice?.includes(text.trim())) {
      return this.sendOther({
        ...options,
        inputMedia: {
          _: 'inputMediaDice',
          emoticon: text.trim()
        }
      });
    }

    const MAX_LENGTH = config.message_length_max;
    const splitted = splitStringByLength(text, MAX_LENGTH);
    text = splitted[0];
    if(splitted.length > 1) {
      if(options.webPage?._ === 'webPage' && !text.includes(options.webPage.url)) {
        delete options.webPage;
      }
    }

    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    const originalEntities = options.entities;
    let entities = splitted.length > 1 && originalEntities?.length ?
      sliceMessageEntities(originalEntities, 0, text.length) :
      originalEntities;
    if(!options.viaBotId) {
      [text, entities] = parseMarkdown(text, entities);
    }

    const sendEntities = this.getInputEntities(entities);

    const message = this.generateOutgoingMessage(peerId, options);
    message.entities = entities;
    message.message = text;

    const isChannel = this.appPeersManager.isChannel(peerId);

    const webPageSend = this.generateOutgoingWebPage(message, options);

    const toggleError = (error?: ApiError, repayRequest?: RepayRequest) => {
      this.onMessagesSendError([message], error, repayRequest);
      this.rootScope.dispatchEvent('messages_pending');
    };

    const paidStars = options.confirmedPaymentResult?.starsAmount || undefined;

    message.send = () => {
      toggleError();
      const sentRequestOptions: PendingAfterMsg = {};
      if(this.pendingAfterMsgs[peerId]) {
        sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
      }

      const sendAs = options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined
      const inputPeer = this.appPeersManager.getInputPeerById(peerId);
      const replyTo = options.replyTo;
      let apiPromise: any;
      if(options.viaBotId) {
        apiPromise = this.apiManager.invokeApiAfter('messages.sendInlineBotResult', {
          peer: inputPeer,
          random_id: message.random_id,
          reply_to: replyTo,
          query_id: options.queryId,
          id: options.resultId,
          clear_draft: options.clearDraft,
          send_as: sendAs,
          allow_paid_stars: paidStars
        }, sentRequestOptions);
      } else {
        let media: InputMedia | undefined;
        if(options.suggestedPost?.changeMid) {
          const changingMessage = this.getMessageByPeer(peerId, options.suggestedPost.changeMid);
          if(changingMessage?._ === 'message')
            media = makeMessageMediaInputForSuggestedPost(changingMessage.media)
        }

        const commonOptions: Partial<MessagesSendMessage | MessagesSendMedia> = {
          peer: inputPeer,
          message: text,
          random_id: message.random_id,
          reply_to: replyTo,
          entities: sendEntities,
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate || undefined,
          schedule_repeat_period: options.scheduleRepeatPeriod || undefined,
          silent: options.silent,
          send_as: sendAs,
          update_stickersets_order: options.updateStickersetOrder,
          invert_media: options.invertMedia,
          effect: options.effect,
          allow_paid_stars: paidStars,
          suggested_post: message.suggested_post,
          media
        };

        const mergedOptions: MessagesSendMessage | MessagesSendMedia = {
          ...commonOptions as any,
          ...webPageSend
        };

        apiPromise = this.apiManager.invokeApiAfter(
          options.webPage || media ? 'messages.sendMedia' : 'messages.sendMessage',
          mergedOptions,
          sentRequestOptions
        );
      }

      this.pendingAfterMsgs[peerId] = sentRequestOptions;

      return apiPromise.then((updates: Updates) => {
        if(updates._ === 'updateShortSentMessage') {
          // * fix copying object with promise
          const promise = message.promise;
          delete message.promise;
          const newMessage = copy(message);
          defineNotNumerableProperties(message, ['promise']);
          message.promise = promise;

          newMessage.date = updates.date;
          newMessage.id = updates.id;
          newMessage.media = updates.media;
          newMessage.entities = updates.entities;
          newMessage.ttl_period = updates.ttl_period;
          this.wrapMessageEntities(newMessage);
          if(updates.pFlags.out) {
            newMessage.pFlags.out = true;
          }

          // * override with new updates
          const {pts, pts_count} = updates;

          this.apiUpdatesManager.processLocalUpdate({
            _: 'updateMessageID',
            random_id: message.random_id,
            id: newMessage.id
          });

          this.apiUpdatesManager.processLocalUpdate({
            _: options.scheduleDate ? 'updateNewScheduledMessage' : (isChannel ? 'updateNewChannelMessage' : 'updateNewMessage'),
            message: newMessage,
            pts,
            pts_count
          });

          updates = undefined;
        } else if((updates as Updates.updates).updates) {
          (updates as Updates.updates).updates.forEach((update) => {
            if(update._ === 'updateDraftMessage') {
              update.local = true;
            }
          });
        }

        if(updates) {
          this.apiUpdatesManager.processUpdateMessage(updates);
          this.apiUpdatesManager.processPaidMessageUpdate({
            paidStars,
            wereStarsReserved: options.confirmedPaymentResult?.canUndo
          });
        }

        message.promise.resolve();
      }, (error: ApiError) => {
        const repayRequest = this.repayRequestHandler.tryRegisterRequest({
          error,
          messageCount: 1,
          repayCallback: (override) => {
            this.cancelPendingMessage(message.random_id);
            this.sendText({...options, ...override})
          },
          paidStars,
          wereStarsReserved: options.confirmedPaymentResult?.canUndo
        });

        toggleError(error, repayRequest);
        message.promise.reject(error);
        throw error;
      }).finally(() => {
        if(this.pendingAfterMsgs[peerId] === sentRequestOptions) {
          delete this.pendingAfterMsgs[peerId];
        }
      });
    };

    this.beforeMessageSending(message, {
      isScheduled: !!options.scheduleDate || undefined,
      threadId: options.threadId,
      clearDraft: options.clearDraft,
      sequential: true,
      confirmedPaymentResult: options.confirmedPaymentResult
    });

    const promises: ReturnType<AppMessagesManager['sendText']>[] = [message.promise];
    let partOffset = splitted[0].length;
    for(let i = 1; i < splitted.length; ++i) {
      promises.push(this.sendText({
        ...options,
        peerId,
        text: splitted[i],
        entities: originalEntities?.length ? sliceMessageEntities(originalEntities, partOffset, splitted[i].length) : undefined
      }));
      partOffset += splitted[i].length;
    }

    return Promise.all(promises).then(noop);
  }

  public async sendFile(options: SendFileArgs) {
    if(options.stars && options.isAnimated) {
      // * paid media can only contain photos and plain videos, the server rejects
      // * animated documents with EXTENDED_MEDIA_TYPE_INVALID — send the GIF as a silent video
      options = {...options, isAnimated: false};
    }

    let file = options.file;
    let {peerId} = options;
    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    await this.checkSendOptions(options);

    const isDocument = !(file instanceof File) && !(file instanceof Blob);
    if(isDocument) {
      file = this.appDocsManager.getDoc((file as MyDocument).id) || file;
    }

    const hadMessageBefore = !!options.groupedMessage;
    const message = options.groupedMessage || this.generateOutgoingMessage(peerId, options);

    let caption = options.caption || '';

    let entities = options.entities || [];
    if(caption) {
      [caption, entities] = parseMarkdown(caption, entities);
    }

    const mediaTempId = options.useTempMediaId ? this.mediaTempId++ : message.id;

    const documentAndMeta = this.makeDocumentAndMetaForSendingFile({
      mediaTempId,
      isDocument,
      file,
      entities,
      ...pickKeys(options, [
        'strippedBytes',
        'useTempMediaId',
        'isVoiceMessage',
        'width',
        'height',
        'objectURL',
        'waveform',
        'duration',
        'isMedia',
        'isRoundMessage',
        'noSound',
        'thumb',
        'isAnimated'
      ])
    });

    const {
      document,
      apiFileName,
      actionName,
      photo,
      fileType,
      mediaUnread,
      attributes
    } = documentAndMeta;

    const {
      attachType
    } = documentAndMeta;

    if(message && mediaUnread) {
      message.pFlags.media_unread = true;
    }

    this.log('sendFile', file, fileType);
    this.log('sendFile', attachType, apiFileName, file.type, options);

    const sentDeferred = deferredPromise<InputMedia>();

    const media: MessageMedia = {
      _: photo && !isDocument ? 'messageMediaPhoto' : 'messageMediaDocument',
      pFlags: {
        ...(options.spoiler ? {spoiler: true} : {})
      },
      photo,
      document: isDocument ? file as Document.document : document
    };

    if(!isDocument) {
      defineNotNumerableProperties(media as any, ['promise']);
      (media as any).promise = sentDeferred;
    }

    const sendEntities = this.getInputEntities(entities);

    const uploadingFileName = !isDocument ? getFileNameForUpload(file as File | Blob) : undefined;
    if(uploadingFileName) {
      this.uploadFilePromises[uploadingFileName] = sentDeferred;
    }

    if(!hadMessageBefore) {
      if(options.invertMedia) {
        message.pFlags.invert_media = true;
      }

      message.entities = entities;
      message.message = caption;
      message.media = media;
      message.uploadingFileName = uploadingFileName ? [uploadingFileName] : undefined;

      if(options.stars && !options.isGroupedItem) {
        message.media = this.generateOutgoingPaidMedia([message], options.stars);
      }
    }

    const toggleError = (error?: ApiError, repayRequest?: RepayRequest) => {
      this.onMessagesSendError([message], error, repayRequest);
      this.rootScope.dispatchEvent('messages_pending');
    };

    let uploaded = false,
      uploadPromise: ReturnType<ApiFileManager['upload']>;

    const upload = () => {
      if(isDocument) {
        let inputMedia: InputMedia = {
          _: 'inputMediaDocument',
          id: getDocumentInput(file as MyDocument),
          pFlags: pickKeys((media as MessageMedia.messageMediaDocument).pFlags, ['spoiler'])
        };

        if(options.stars && !options.isGroupedItem) {
          inputMedia = {
            _: 'inputMediaPaidMedia',
            extended_media: [inputMedia],
            stars_amount: '' + options.stars
          };
        }

        sentDeferred.resolve(inputMedia);
      } else if(file instanceof File || file instanceof Blob) {
        const load = () => {
          if(!uploaded || message?.error) {
            uploaded = false;

            uploadPromise = this.apiFileManager.upload({file, fileName: uploadingFileName});
            uploadPromise.catch((err) => {
              if(uploaded) {
                return;
              }

              this.log('cancelling upload', media);

              message && this.cancelPendingMessage(message.random_id);
              this.setTyping(peerId, {_: 'sendMessageCancelAction'}, undefined, options.threadId);
              sentDeferred.reject(err);
            });

            uploadPromise.addNotifyListener((progress: Progress) => {
              /* if(DEBUG) {
                this.log('upload progress', progress);
              } */

              const percents = Math.max(1, Math.floor(100 * progress.done / progress.total));
              if(actionName) {
                this.setTyping(peerId, {_: actionName, progress: percents | 0}, undefined, options.threadId);
              }
              sentDeferred.notifyAll(progress);
            });

            sentDeferred.notifyAll({done: 0, total: file.size});
          }

          let thumbUploadPromise: ReturnType<typeof this.uploadThumbAndCover>;
          if(attachType === 'video' && options.objectURL && options.thumb?.blob) {
            thumbUploadPromise = this.uploadThumbAndCover({
              blob: options.thumb.blob,
              isCover: !!options.thumb.isCover,
              peer: this.appPeersManager.getInputPeerById(peerId)
            });
          }

          uploadPromise && uploadPromise.then(async(inputFile) => {
            /* if(DEBUG) {
              this.log('appMessagesManager: sendFile uploaded:', inputFile);
            } */

            (inputFile as InputFile.inputFile).name = apiFileName;
            uploaded = true;
            let inputMedia: InputMedia;
            switch(attachType) {
              case 'photo':
                inputMedia = {
                  _: 'inputMediaUploadedPhoto',
                  file: inputFile,
                  pFlags: {
                    spoiler: options.spoiler || undefined
                  }
                };
                break;

              default:
                inputMedia = {
                  _: 'inputMediaUploadedDocument',
                  file: inputFile,
                  mime_type: fileType,
                  pFlags: {
                    force_file: actionName === 'sendMessageUploadDocumentAction' || undefined,
                    spoiler: options.spoiler || undefined,
                    // * the server rejects a silent paid video without this flag
                    // * (it classifies it as a GIF): EXTENDED_MEDIA_TYPE_INVALID
                    nosound_video: (options.stars && attachType === 'video') || undefined
                    // nosound_video: options.noSound ? true : undefined
                  },
                  attributes
                };
            }

            if(options.stars && !options.isGroupedItem) {
              inputMedia = {
                _: 'inputMediaPaidMedia',
                extended_media: [inputMedia],
                stars_amount: '' + options.stars
              };
            }

            if(thumbUploadPromise) {
              try {
                const thumbUploadResult = await thumbUploadPromise;
                assumeType<InputMedia.inputMediaUploadedDocument>(inputMedia);

                inputMedia.thumb = thumbUploadResult.file;
                inputMedia.video_cover = thumbUploadResult.coverPhoto;
              } catch(err) {
                this.log.error('sendFile thumb upload error:', err);
              }
            }

            sentDeferred.resolve(inputMedia);
          }, (error: ApiError) => {
            toggleError(error);
          });

          return sentDeferred;
        };

        if(options.isGroupedItem) {
          load();
        } else {
          this.sendSmthLazyLoadQueue.push({
            load
          });
        }
      }

      return sentDeferred;
    };

    if(!hadMessageBefore && !options.confirmedPaymentResult?.canUndo) {
      message.send = upload;
    }

    if(!hadMessageBefore) this.beforeMessageSending(message, {
      isGroupedItem: options.isGroupedItem,
      isScheduled: !!options.scheduleDate || undefined,
      threadId: options.threadId,
      clearDraft: options.clearDraft,
      processAfter: options.processAfter
    });

    if(!options.isGroupedItem) {
      const paidStars = options.confirmedPaymentResult?.starsAmount || undefined;

      const invokeSend = (inputMedia: Awaited<typeof sentDeferred>) => {
        return this.apiManager.invokeApi('messages.sendMedia', {
          background: options.background,
          peer: this.appPeersManager.getInputPeerById(peerId),
          media: inputMedia,
          message: caption,
          random_id: message.random_id,
          reply_to: options.replyTo,
          schedule_date: options.scheduleDate,
          schedule_repeat_period: options.scheduleRepeatPeriod || undefined,
          silent: options.silent,
          entities: sendEntities,
          clear_draft: options.clearDraft,
          send_as: options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined,
          update_stickersets_order: options.updateStickersetOrder,
          invert_media: options.invertMedia,
          effect: options.effect,
          allow_paid_stars: paidStars,
          suggested_post: message.suggested_post
        }).then((updates) => {
          this.apiUpdatesManager.processUpdateMessage(updates)
          this.apiUpdatesManager.processPaidMessageUpdate({
            paidStars,
            wereStarsReserved: options.confirmedPaymentResult?.canUndo
          });
        });
      };

      const send = () => {
        sentDeferred.then((inputMedia) => {
          this.setTyping(peerId, {_: 'sendMessageCancelAction'}, undefined, options.threadId);

          let promise: Promise<void>;
          if(inputMedia._ === 'inputMediaDocument') {
            promise = this.apiFileManager.invokeApiWithReference({
              context: inputMedia.id as InputDocument.inputDocument,
              callback: () => invokeSend(inputMedia)
            });
          } else {
            promise = invokeSend(inputMedia);
          }

          return promise.catch((error: ApiError) => {
            if(attachType === 'photo' &&
              (error.type === 'PHOTO_INVALID_DIMENSIONS' ||
              error.type === 'PHOTO_SAVE_FILE_INVALID')) {
              // The server rejected the photo (e.g. oversized after editing). The
              // photo->document auto-fallback that used to live here never actually
              // re-sent — by this point the upload deferred is already settled and
              // send() isn't re-invoked — so the message was left silently stuck
              // with no error. Surface the error on the bubble instead.
              error.handled = true;
              toggleError(error);
              throw error;
            }

            const repayRequest = this.repayRequestHandler.tryRegisterRequest({
              error,
              messageCount: 1,
              paidStars,
              repayCallback: (override) => {
                this.cancelPendingMessage(message.random_id);
                this.sendFile({...options, ...override});
              },
              wereStarsReserved: options.confirmedPaymentResult?.canUndo
            });

            toggleError(error, repayRequest);
            throw error;
          });
        });

        const messagePromise = message.promise as CancellablePromise<void>;
        sentDeferred.then(
          () => messagePromise.resolve(),
          (err) => messagePromise.reject(err)
        );
      };

      if(options.confirmedPaymentResult?.canUndo) {
        upload();

        this.paidMessagesQueue.add(peerId, {
          send,
          cancel: () => {
            this.cancelPendingMessage(message.random_id);
            (message.promise as CancellablePromise<void>)?.reject();
          }
        });
      } else {
        send();
      }
    }

    const ret: {
      message: typeof message,
      promise: typeof sentDeferred,
      send: typeof upload,
      media: typeof media,
      uploadingFileName: typeof uploadingFileName
    } = {
      message,
      media,
      uploadingFileName
    } as any;

    defineNotNumerableProperties(ret, ['promise', 'send']);
    ret.promise = sentDeferred;
    ret.send = upload;

    return ret;
  }

  public makeDocumentAndMetaForSendingFile(args: MakeDocumentAndMetaForSendingFileArgs) {
    const {file, isDocument, mediaTempId} = args;

    let attachType: 'document' | 'audio' | 'video' | 'voice' | 'photo', apiFileName: string;
    let mediaUnread: boolean;

    const fileType = (file as Document.document).mime_type || file.type;
    const fileName = file instanceof File ? file.name : '';

    const attributes: DocumentAttribute[] = [];

    const isPhoto = getEnvironment().IMAGE_MIME_TYPES_SUPPORTED.has(fileType);

    const strippedPhotoSize: PhotoSize.photoStrippedSize = args.strippedBytes && {
      _: 'photoStrippedSize',
      bytes: args.strippedBytes,
      type: 'i'
    };

    let photo: MyPhoto, document: MyDocument;

    let actionName: Extract<SendMessageAction['_'], 'sendMessageUploadAudioAction' | 'sendMessageUploadDocumentAction' | 'sendMessageUploadPhotoAction' | 'sendMessageUploadVideoAction'>;

    if(isDocument) { // maybe it's a sticker or gif
      attachType = 'document';
      apiFileName = '';
    } else if(fileType.indexOf('audio/') === 0 || ['video/ogg'].indexOf(fileType) >= 0) {
      attachType = 'audio';
      apiFileName = 'audio.' + (fileType.split('/')[1] === 'ogg' ? 'ogg' : 'mp3');
      actionName = 'sendMessageUploadAudioAction';

      if(args.isVoiceMessage) {
        attachType = 'voice';
        mediaUnread = true;
      }

      const attribute: DocumentAttribute.documentAttributeAudio = {
        _: 'documentAttributeAudio',
        pFlags: {
          voice: args.isVoiceMessage || undefined
        },
        waveform: args.waveform,
        duration: args.duration || undefined
      };

      attributes.push(attribute);
    } else if(!args.isMedia) {
      attachType = 'document';
      apiFileName = 'document.' + fileType.split('/')[1];
      actionName = 'sendMessageUploadDocumentAction';
    } else if(isPhoto) {
      attachType = 'photo';
      apiFileName = 'photo.' + fileType.split('/')[1];
      actionName = 'sendMessageUploadPhotoAction';

      const photoSize = {
        _: 'photoSize',
        w: args.width,
        h: args.height,
        type: THUMB_TYPE_FULL,
        location: null,
        size: file.size
      } as PhotoSize.photoSize;

      photo = {
        _: 'photo',
        id: mediaTempId,
        sizes: [photoSize],
        w: args.width,
        h: args.height
      } as any;

      if(strippedPhotoSize) {
        photo.sizes.unshift(strippedPhotoSize);
      }

      this.thumbsStorage.setCacheContextURL(
        photo,
        photoSize.type,
        args.objectURL || '',
        file.size
      );

      photo = this.appPhotosManager.savePhoto(photo);
    } else if(getEnvironment().VIDEO_MIME_TYPES_SUPPORTED.has(fileType as VIDEO_MIME_TYPE)) {
      attachType = 'video';
      apiFileName = 'video.mp4';
      actionName = 'sendMessageUploadVideoAction';

      const videoAttribute: DocumentAttribute.documentAttributeVideo = {
        _: 'documentAttributeVideo',
        pFlags: {
          round_message: args.isRoundMessage || undefined,
          supports_streaming: true
        },
        duration: args.duration,
        w: args.width,
        h: args.height
      };

      attributes.push(videoAttribute);

      // * must follow after video attribute
      if(args.isAnimated) {
        attributes.push({
          _: 'documentAttributeAnimated'
        });
      }
    } else {
      attachType = 'document';
      apiFileName = 'document.' + fileType.split('/')[1];
      actionName = 'sendMessageUploadDocumentAction';
    }

    attributes.push({_: 'documentAttributeFilename', file_name: fileName || apiFileName});

    if(
      (['document', 'video', 'audio', 'voice'] as (typeof attachType)[]).includes(attachType) &&
      !isDocument
    ) {
      const thumbs: PhotoSize[] = [];
      document = {
        _: 'document',
        id: mediaTempId,
        duration: args.duration,
        attributes,
        w: args.width,
        h: args.height,
        thumbs,
        mime_type: fileType,
        size: file.size
      } as any;

      if(args.objectURL) {
        this.thumbsStorage.setCacheContextURL(
          document,
          undefined,
          args.objectURL,
          file.size
        );
      }

      let thumb: PhotoSize.photoSize;
      if(isPhoto) {
        attributes.push({
          _: 'documentAttributeImageSize',
          w: args.width,
          h: args.height
        });

        thumb = {
          _: 'photoSize',
          w: args.width,
          h: args.height,
          type: THUMB_TYPE_FULL,
          size: file.size
        };
      } else if(attachType === 'video') {
        if(args.thumb) {
          thumb = {
            _: 'photoSize',
            w: args.thumb.size.width,
            h: args.thumb.size.height,
            type: 'local-thumb',
            size: args.thumb.blob.size
          };

          this.thumbsStorage.setCacheContextURL(
            document,
            thumb.type,
            args.thumb.url,
            thumb.size
          );
        }
      }

      if(thumb) {
        thumbs.push(thumb);
      }

      if(strippedPhotoSize) {
        thumbs.unshift(strippedPhotoSize);
      }

      /* if(thumbs.length) {
        const thumb = thumbs[0] as PhotoSize.photoSize;
        const docThumb = appPhotosManager.getDocumentCachedThumb(document.id);
        docThumb.downloaded = thumb.size;
        docThumb.url = thumb.url;
      } */

      document = this.appDocsManager.saveDoc(document);
    }

    return {
      document,
      apiFileName,
      actionName,
      attachType,
      photo,
      fileType,
      mediaUnread,
      attributes
    };
  }

  private async uploadThumbAndCover({blob, isCover, peer, onUploadPromise}: UploadThumbAndCoverArgs) {
    const promise = this.apiFileManager.upload({file: blob});
    onUploadPromise?.(promise);

    const file = await promise;

    if(!isCover) return {file};

    try {
      const coverPhoto = await this.uploadVideoCover({file, peer});
      return {file, coverPhoto};
    } catch(err) {
      this.log.error('uploadVideoCover error:', err);
    }

    return {file};
  }

  private async uploadVideoCover({file, peer}: UploadVideoCoverArgs) {
    const media: InputMedia.inputMediaUploadedPhoto = {
      _: 'inputMediaUploadedPhoto',
      file,
      pFlags: {}
    };

    const messageMedia = await this.apiManager.invokeApi('messages.uploadMedia', {peer, media});

    if(messageMedia._ !== 'messageMediaPhoto') throw new Error('Uploaded video cover is not a photo');

    const photo = this.appPhotosManager.savePhoto(messageMedia.photo);

    return getPhotoInput(photo);
  }

  public async sendGrouped(options: MessageSendingParams & {
    isMedia?: boolean,
    entities?: MessageEntity[],
    caption?: string,
    sendFileDetails: SendFileDetails[],
    clearDraft?: boolean,
    stars?: number
  }) {
    await this.checkSendOptions(options);

    if(options.sendFileDetails.length === 1) {
      return this.sendFile({...options, ...options.sendFileDetails[0]});
    }

    let {peerId} = options;
    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    let caption = options.caption || '';
    let entities = options.entities || [];
    if(caption) {
      [caption, entities] = parseMarkdown(caption, entities);
    }

    let sendEntities = this.getInputEntities(entities);

    const log = this.log.bindPrefix('sendGrouped');
    log(options);

    const groupId = options.stars ? undefined : '' + ++this.groupedTempId;

    const callbacks: Array<() => void> = [];
    const processAfter = (cb: () => void) => {
      callbacks.push(cb);
    };

    let firstMessage: Message.message;
    const isSingleMessageForAlbum = !!options.stars;
    const preserveMediaTempId = this.mediaTempId;
    const _results = options.sendFileDetails.map(async(details, idx) => {
      const o: Parameters<AppMessagesManager['sendFile']>[0] = {
        peerId,
        isGroupedItem: true,
        isMedia: options.isMedia,
        scheduleDate: options.scheduleDate,
        silent: options.silent,
        replyToMsgId: options.replyToMsgId,
        replyToStoryId: options.replyToStoryId,
        replyToQuote: options.replyToQuote,
        threadId: options.threadId,
        sendAsPeerId: options.sendAsPeerId,
        useTempMediaId: isSingleMessageForAlbum,
        groupedMessage: isSingleMessageForAlbum && firstMessage,
        groupId,
        stars: options.stars,
        processAfter,
        ...details
      };

      if(idx === 0) {
        o.caption = caption;
        o.entities = entities;
        o.effect = options.effect;
      }

      const result = await this.sendFile(o);

      if(idx === 0) {
        firstMessage = result.message;
        firstMessage.paid_message_stars = options.confirmedPaymentResult?.starsAmount;
      }

      return result;
    });
    const results = await Promise.all(_results);

    if(options.stars) {
      const message = results[0].message;
      message.media = this.generateOutgoingPaidMedia(results, options.stars);
      this.mediaTempMap[message.id] = preserveMediaTempId;
      message.uploadingFileName = results.map(({uploadingFileName}) => uploadingFileName);
    }

    if(options.clearDraft) {
      callbacks.push(() => {
        this.appDraftsManager.clearDraft({peerId, threadId: options.threadId, monoforumThreadId: options.replyToMonoforumPeerId});
      });
    }

    callbacks.forEach((callback) => {
      callback();
    });

    // * test pending
    if(DO_NOT_SEND_MESSAGES) {
      return;
    }

    const toggleError = (message: Message.message, error?: ApiError, repayRequest?: RepayRequest) => {
      if(message.error === error) {
        return;
      }

      this.onMessagesSendError([message], error, repayRequest);
      this.rootScope.dispatchEvent('messages_pending');
    };

    const inputPeer = this.appPeersManager.getInputPeerById(peerId);
    const invoke = (multiMedia: InputSingleMedia[]) => {
      this.setTyping(peerId, {_: 'sendMessageCancelAction'}, undefined, options.threadId);

      const deferred = deferredPromise<void>();
      this.sendSmthLazyLoadQueue.push({
        load: () => {
          const paidStars = options.confirmedPaymentResult?.starsAmount * multiMedia.length || undefined
          return this.apiManager.invokeApi(options.stars ? 'messages.sendMedia' : 'messages.sendMultiMedia', {
            peer: inputPeer,
            reply_to: options.replyTo,
            schedule_date: options.scheduleDate,
            schedule_repeat_period: options.scheduleRepeatPeriod || undefined,
            silent: options.silent,
            clear_draft: options.clearDraft,
            send_as: options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined,
            update_stickersets_order: options.updateStickersetOrder,
            invert_media: options.invertMedia,
            effect: options.effect,
            allow_paid_stars: paidStars,
            ...(options.stars ? {
              media: multiMedia[0].media,
              message: multiMedia[0].message,
              entities: multiMedia[0].entities,
              random_id: multiMedia[0].random_id
            } : {
              multi_media: multiMedia
            })
          }).then((updates) => {
            this.apiUpdatesManager.processUpdateMessage(updates);
            this.apiUpdatesManager.processPaidMessageUpdate({
              paidStars,
              wereStarsReserved: options.confirmedPaymentResult?.canUndo
            });

            deferred.resolve();
          }, (error: ApiError) => {
            const repayRequest = this.repayRequestHandler.tryRegisterRequest({
              error,
              paidStars,
              messageCount: multiMedia.length,
              repayCallback: (override) => {
                results.forEach(({message}) => this.cancelPendingMessage(message.random_id));
                this.sendGrouped({...options, ...override});
              },
              wereStarsReserved: options.confirmedPaymentResult?.canUndo
            });

            results.forEach(({message}) => toggleError(message, error, repayRequest));
            deferred.reject(error);
          });
        }
      });

      return deferred;
    };

    const promises: Promise<InputSingleMedia>[] = results.map(async({message, send}) => {
      let inputMedia: InputMedia;
      try {
        inputMedia = await send() as InputMedia;
      } catch(err) {
        const isUploadCanceled = (err as ApiError).type === 'UPLOAD_CANCELED';
        if(isUploadCanceled && !isSingleMessageForAlbum) {
          return undefined;
        }

        if(!isUploadCanceled) {
          log.error('upload item error:', err, message);
        }
        toggleError(message, err as ApiError);
        throw err;
      }

      let messageMedia: MessageMedia;
      try {
        messageMedia = await this.apiManager.invokeApi('messages.uploadMedia', {
          peer: inputPeer,
          media: inputMedia
        });
      } catch(err) {
        log.error('uploadMedia error:', err, message);
        toggleError(message, err as ApiError);
        throw err;
      }

      const originalInputMedia = inputMedia;
      if(messageMedia._ === 'messageMediaPhoto') {
        const photo = this.appPhotosManager.savePhoto(messageMedia.photo);
        inputMedia = getPhotoMediaInput(photo);
      } else if(messageMedia._ === 'messageMediaDocument') {
        const doc = this.appDocsManager.saveDoc(messageMedia.document);
        inputMedia = getDocumentMediaInput(doc);
      }

      // copy original flags
      const copyProperties: (keyof InputMedia.inputMediaPhoto)[] = [
        'pFlags',
        'ttl_seconds'
      ];

      copyProperties.forEach((property) => {
        // @ts-ignore
        inputMedia[property] = originalInputMedia[property] ?? inputMedia[property];
      });

      const inputSingleMedia: InputSingleMedia = {
        _: 'inputSingleMedia',
        media: inputMedia,
        random_id: message?.random_id,
        message: caption,
        entities: sendEntities
      };

      // * only 1 caption for all inputs
      if(caption) {
        caption = '';
        sendEntities = undefined;
      }

      return inputSingleMedia;
    });

    return Promise.all(promises).then((inputs) => {
      inputs = inputs.filter(Boolean);

      if(options.stars) {
        const spliced = inputs.splice(1, Infinity);
        inputs[0].media = {
          _: 'inputMediaPaidMedia',
          extended_media: [
            inputs[0].media,
            ...spliced.map(({media}) => media)
          ],
          stars_amount: '' + options.stars
        };
      }

      if(options.confirmedPaymentResult?.canUndo) {
        this.paidMessagesQueue.add(peerId, {
          send: () => void invoke(inputs),
          cancel: () => results.forEach(({message}) => this.cancelPendingMessage(message.random_id))
        });
        return;
      }
      return invoke(inputs);
    });
  }

  public sendContact({peerId, contactPeerId, monoforumThreadId, confirmedPaymentResult}: SendContactArgs) {
    return this.sendOther({
      peerId,
      inputMedia: this.appUsersManager.getContactMediaInput(contactPeerId),
      replyToMonoforumPeerId: monoforumThreadId,
      confirmedPaymentResult
    });
  }

  public async sendOther(
    options: MessageSendingParams & Partial<{
      inputMedia: InputMedia | {_: 'messageMediaPending', messageMedia: MessageMedia},
      viaBotId: BotId,
      replyMarkup: ReplyMarkup,
      clearDraft: boolean,
      queryId: string
      resultId: string,
      geoPoint: GeoPoint,
      webDocument?: WebDocument
    }>
  ) {
    let {peerId, inputMedia} = options;
    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    const noOutgoingMessage = /* inputMedia?._ === 'inputMediaPhotoExternal' ||  */inputMedia?._ === 'inputMediaDocumentExternal';
    await this.checkSendOptions(options);
    const message = this.generateOutgoingMessage(peerId, options);

    let media: MessageMedia;
    switch(inputMedia._) {
      case 'inputMediaPoll': {
        // const pollId = '' + message.id;
        const pollId = randomLong();
        inputMedia.poll.id = pollId;
        this.appPollsManager.savePoll(inputMedia.poll, {
          _: 'pollResults',
          total_voters: 0,
          pFlags: {},
          recent_voters: []
        });

        const {poll, results} = this.appPollsManager.getPoll(pollId);
        media = {
          _: 'messageMediaPoll',
          poll,
          results
        };

        break;
      }

      case 'inputMediaPhoto': {
        media = {
          _: 'messageMediaPhoto',
          photo: this.appPhotosManager.getPhoto((inputMedia.id as InputPhoto.inputPhoto).id),
          pFlags: pickKeys(inputMedia.pFlags, ['spoiler'])
        };
        break;
      }

      case 'inputMediaDocument': {
        const doc = this.appDocsManager.getDoc((inputMedia.id as InputDocument.inputDocument).id);
        media = {
          _: 'messageMediaDocument',
          document: doc,
          pFlags: pickKeys(inputMedia.pFlags, ['spoiler'])
        };
        break;
      }

      case 'inputMediaContact': {
        media = {
          _: 'messageMediaContact',
          phone_number: inputMedia.phone_number,
          first_name: inputMedia.first_name,
          last_name: inputMedia.last_name,
          user_id: inputMedia.user_id ?? '0',
          vcard: inputMedia.vcard
        };
        break;
      }

      case 'inputMediaGeoPoint': {
        media = {
          _: 'messageMediaGeo',
          geo: options.geoPoint
        };
        break;
      }

      case 'inputMediaVenue': {
        media = {
          _: 'messageMediaVenue',
          geo: options.geoPoint,
          title: inputMedia.title,
          address: inputMedia.address,
          provider: inputMedia.provider,
          venue_id: inputMedia.venue_id,
          venue_type: inputMedia.venue_type
        };
        break;
      }

      case 'inputMediaPhotoExternal': {
        if(noOutgoingMessage) {
          break;
        }

        media = {
          _: 'messageMediaPhotoExternal',
          photo: options.webDocument
        };
        break;
      }

      case 'inputMediaDocumentExternal': {
        if(noOutgoingMessage) {
          break;
        }

        media = {
          _: 'messageMediaDocumentExternal',
          document: options.webDocument
        };
        break;
      }

      case 'inputMediaStory': {
        media = {
          _: 'messageMediaStory',
          id: inputMedia.id,
          pFlags: {},
          peer: this.appPeersManager.getOutputPeer(this.appPeersManager.getPeerId(inputMedia.peer))
        };
        break;
      }

      case 'inputMediaTodo': {
        media = {
          _: 'messageMediaToDo',
          todo: inputMedia.todo
        };
        break;
      }

      case 'inputMediaDice': {
        media = {
          _: 'messageMediaDice',
          emoticon: inputMedia.emoticon,
          value: 0
        };
        break;
      }

      case 'messageMediaPending': {
        media = inputMedia.messageMedia;
        break;
      }
    }

    message.media = media;

    const toggleError = (error?: ApiError, repayRequest?: RepayRequest) => {
      this.onMessagesSendError([message], error, repayRequest);
      this.rootScope.dispatchEvent('messages_pending');
    };

    message.send = () => {
      const sentRequestOptions: PendingAfterMsg = {};
      if(this.pendingAfterMsgs[peerId]) {
        sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
      }

      const paidStars = options.confirmedPaymentResult?.starsAmount || undefined;
      const sendAs = options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined;
      let apiPromise: Promise<any>;
      if(options.viaBotId) {
        apiPromise = this.apiManager.invokeApiAfter('messages.sendInlineBotResult', {
          peer: this.appPeersManager.getInputPeerById(peerId),
          random_id: message.random_id,
          reply_to: options.replyTo,
          query_id: options.queryId,
          id: options.resultId,
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate,
          silent: options.silent,
          send_as: sendAs,
          allow_paid_stars: paidStars
        }, sentRequestOptions);
      } else {
        apiPromise = this.apiManager.invokeApiAfter('messages.sendMedia', {
          peer: this.appPeersManager.getInputPeerById(peerId),
          media: inputMedia as InputMedia,
          random_id: message.random_id,
          reply_to: options.replyTo,
          message: message.message,
          entities: undefined,
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate,
          schedule_repeat_period: options.scheduleRepeatPeriod || undefined,
          silent: options.silent,
          send_as: sendAs,
          update_stickersets_order: options.updateStickersetOrder,
          allow_paid_stars: paidStars
        }, sentRequestOptions);
      }

      this.pendingAfterMsgs[peerId] = sentRequestOptions;

      return apiPromise.then((updates) => {
        if(updates.updates) {
          updates.updates.forEach((update: Update) => {
            if(update._ === 'updateDraftMessage') {
              update.local = true;
            }
          });
        }

        this.apiUpdatesManager.processUpdateMessage(updates);
        this.apiUpdatesManager.processPaidMessageUpdate({
          paidStars,
          wereStarsReserved: options.confirmedPaymentResult?.canUndo
        });
        promise.resolve();
      }, (error: ApiError) => {
        const repayRequest = this.repayRequestHandler.tryRegisterRequest({
          error,
          paidStars,
          messageCount: 1,
          repayCallback: (override) => {
            this.cancelPendingMessage(message.random_id);
            this.sendOther({...options, ...override});
          },
          wereStarsReserved: options.confirmedPaymentResult?.canUndo
        });
        toggleError(error, repayRequest);
        promise.reject(error);
        throw error;
      }).finally(() => {
        if(this.pendingAfterMsgs[peerId] === sentRequestOptions) {
          delete this.pendingAfterMsgs[peerId];
        }
      });
    };

    this.beforeMessageSending(message, {
      isScheduled: !!options.scheduleDate || undefined,
      threadId: options.threadId,
      clearDraft: options.clearDraft,
      sequential: true,
      noOutgoingMessage,
      confirmedPaymentResult: options.confirmedPaymentResult
    });

    const promise = message.promise;
    return promise;
  }

  public getMediaTempId() {
    return this.mediaTempId++;
  }

  public toggleError(message: Message.message, error?: ApiError, repayRequest?: RepayRequest) {
    this.onMessagesSendError([message], error, repayRequest);
    this.rootScope.dispatchEvent('messages_pending');
  };

  public getMonoforumThreadId(peerId: PeerId, savedPeerId: Peer) {
    return savedPeerId && this.appPeersManager.isMonoforum(peerId) ? this.appPeersManager.getPeerId(savedPeerId) : undefined;
  }

  public getInputReplyTo(options: MessageSendingParams): InputReplyTo {
    if(options.replyToStoryId) {
      return {
        _: 'inputReplyToStory',
        story_id: options.replyToStoryId,
        peer: this.appPeersManager.getInputPeerById(options.peerId)
      };
    } else if(options.replyToMsgId) {
      return {
        _: 'inputReplyToMessage',
        monoforum_peer_id: this.appPeersManager.canManageDirectMessages(options.peerId) && options.replyToMonoforumPeerId ?
          this.appPeersManager.getInputPeerById(options.replyToMonoforumPeerId) :
          undefined,
        reply_to_msg_id: getServerMessageId(options.replyToMsgId),
        reply_to_peer_id: options.replyToPeerId && this.appPeersManager.getInputPeerById(options.replyToPeerId),
        top_msg_id: options.threadId ? getServerMessageId(options.threadId) : undefined,
        poll_option: options.replyToPollOption,
        ...(options.replyToQuote && {
          quote_text: options.replyToQuote.text,
          quote_entities: options.replyToQuote.entities,
          quote_offset: options.replyToQuote.offset
        })
      };
    } else if(this.appPeersManager.canManageDirectMessages(options.peerId) && options.replyToMonoforumPeerId) {
      return {
        _: 'inputReplyToMonoForum',
        monoforum_peer_id: this.appPeersManager.getInputPeerById(options.replyToMonoforumPeerId)
      };
    }
  }

  public checkSendOptions(options: MessageSendingParams & Partial<{ text: string }>) {
    const {peerId} = options;
    if(
      this.appPeersManager.isBotforum(peerId) &&
      this.appPeersManager.canManageBotforumTopics(peerId) &&
      !options.replyToMsgId &&
      (!options.threadId || isTempId(options.threadId))
    ) {
      options.threadId = undefined;
      const pendingTopic = this.getPendingOrCreateBotforumTopic({peerId, title: fitSymbols(options.text || TOPIC_TITLE_DEFAULT, TOPIC_TITLE_MAX_LENGTH)});

      if(!options.replyToMsgId) {
        options.replyToMsgId = pendingTopic.tempId;
        pendingTopic.beforeMessageSendCallbacks.push(() => {
          options.replyToMsgId = pendingTopic.newId;
          if(options.replyTo?._ === 'inputReplyToMessage') options.replyTo.reply_to_msg_id = pendingTopic.newId;
        });
      }
    }

    if(options.threadId && !options.replyToMsgId) {
      options.replyToMsgId = options.threadId;
    }

    options.replyTo ??= this.getInputReplyTo(options);
    // if(options.scheduleDate) {
    //   const minTimestamp = (Date.now() / 1000 | 0) + 10;
    //   if(options.scheduleDate <= minTimestamp) {
    //     delete options.scheduleDate;
    //   }
    // }

    // * make sure every sending method is awaiting the same promises
    return this.getCommonThingsForSending();
  }

  public beforeMessageSending(message: Message.message, options: Pick<MessageSendingParams, 'threadId' | 'savedReaction' | 'confirmedPaymentResult'> & Partial<{
    isGroupedItem: boolean,
    isScheduled: boolean,
    clearDraft: boolean,
    sequential: boolean,
    processAfter?: (cb: () => void) => void,
    noOutgoingMessage?: boolean
  }> = {}) {
    const messageId = message.id;
    const peerId = this.getMessagePeer(message);
    const storage = options.isScheduled ? this.getScheduledMessagesStorage(peerId) : this.getHistoryMessagesStorage(peerId);
    const monoforumThreadId = this.getMonoforumThreadId(peerId, message.saved_peer_id);

    message.storageKey = storage.key;

    const callbacks: Array<() => void> = [];
    if(options.isScheduled && !options.noOutgoingMessage) {
      // if(!options.isGroupedItem) {
      this.saveMessages([message], {storage, isScheduled: true, isOutgoing: true});
      callbacks.push(() => {
        this.rootScope.dispatchEvent('scheduled_new', message);
      });
    } else if(!options.noOutgoingMessage) {
      /* if(options.threadId && this.threadsStorage[peerId]) {
        delete this.threadsStorage[peerId][options.threadId];
      } */
      const storages: HistoryStorage[] = [
        this.getHistoryStorage(peerId),
        options.threadId ? this.getHistoryStorage(peerId, options.threadId) : undefined
      ].filter(Boolean);

      for(const storage of storages) {
        storage.history.unshift(messageId);
      }

      this.saveMessages([message], {storage, isOutgoing: true});
      this.setDialogTopMessage(message);
      this.updateMessageContextForInserting(message);

      if(options.threadId) {
        const dialog = this.dialogsStorage.getAnyDialog(peerId, options.threadId);
        if(dialog) {
          this.setDialogTopMessage(message, dialog);
        }
      }

      if(monoforumThreadId) {
        this.monoforumDialogsStorage.checkLastMessageForExistingDialog(message);
      }

      callbacks.push(() => {
        this.rootScope.dispatchEvent('history_append', {storageKey: storage.key, message});
        // storages.forEach((historyStorage) => {
        //   this.rootScope.dispatchEvent('history_append', {storageKey: historyStorage.key, message});
        // });
      });
    }

    let pending: PendingMessageDetails;
    if(!options.noOutgoingMessage) {
      pending = this.pendingByRandomId[message.random_id] = {
        peerId,
        tempId: messageId,
        threadId: options.threadId,
        storage,
        sequential: options.sequential
      };

      if(!options.isScheduled) {
        this.pendingTopMsgs[peerId] = messageId;

        if(options.threadId) {
          this.pendingTopMsgs[`${peerId}_${options.threadId}`] = messageId;
        }
      }
    }

    if(message.reactions) {
      const reaction = message.reactions.results[0].reaction;
      this.invokeAfterMessageIsSent(
        messageId,
        'reactions',
        (message) => {
          return this.appReactionsManager.sendReaction({message, reaction});
        }
      );
    }

    if(!options.isGroupedItem && message.send) {
      callbacks.push(() => {
        if(options.clearDraft) {
          this.appDraftsManager.clearDraft({
            peerId,
            threadId: options.threadId,
            monoforumThreadId
          });
        }
        if(DO_NOT_SEND_MESSAGES) return;

        if(this.pendingNewBotforumTopics[peerId] && !options.threadId) {
          this.pendingNewBotforumTopics[peerId].messageSendCallbacks.push(() => {
            message.send();
          });
        } else if(SEND_MESSAGES_TO_PAID_QUEUE || options.confirmedPaymentResult?.canUndo) {
          this.paidMessagesQueue.add(peerId, {
            send: () => void message?.send?.(),
            cancel: () => void this.cancelPendingMessage(message?.random_id)
          });
        } else {
          message.send();
        }
      });
    }

    if(callbacks.length) {
      (options.processAfter || processAfter)(() => {
        for(const callback of callbacks) {
          callback();
        }
      });
    }

    return pending;
  }

  public generateStandaloneOutgoingMessage(peerId: PeerId) {
    const message = this.generateOutgoingMessage(peerId, {});
    this.saveMessage(message, {storage: new Map() as any});
    return message;
  }

  public generateOutgoingMessage(
    peerId: PeerId,
    options: MessageSendingParams & Partial<{
      viaBotId: BotId,
      groupId: string,
      replyMarkup: ReplyMarkup,
    }>
  ) {
    let postAuthor: string;
    const isBroadcast = this.appPeersManager.isBroadcast(peerId);
    if(isBroadcast) {
      const chat = this.appPeersManager.getPeer(peerId) as Chat.channel;
      if(chat.pFlags.signatures) {
        const user = this.appUsersManager.getSelf();
        const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        postAuthor = fullName;
      }
    }

    let topMessage: number;
    if(options.threadId && !this.appPeersManager.isForum(peerId) && !this.appPeersManager.isBotforum(peerId)) {
      const historyStorage = this.getHistoryStorage(peerId, options.threadId);
      topMessage = historyStorage.history.first[0];
    }

    let media: MessageMedia;
    if(options.suggestedPost?.changeMid) {
      const changingMessage = this.getMessageByPeer(peerId, options.suggestedPost.changeMid);

      if(changingMessage?._ === 'message' && makeMessageMediaInputForSuggestedPost(changingMessage.media)) {
        media = changingMessage.media;
      }
    }

    let fromId: Peer;
    if(this.appPeersManager.isMonoforum(peerId) && this.appPeersManager.canManageDirectMessages(peerId)) {
      const chat = this.appChatsManager.getChat(peerId.toChatId());
      const linkedChannelId = chat?._ === 'channel' && chat?.pFlags?.monoforum && chat?.linked_monoforum_id?.toPeerId?.(true) || undefined;
      fromId = this.appPeersManager.getOutputPeer(linkedChannelId);
    } else {
      fromId = options.sendAsPeerId ? this.appPeersManager.getOutputPeer(options.sendAsPeerId) : this.generateFromId(peerId);
    }

    const message: Message.message = {
      _: 'message',
      id: this.generateTempMessageId(peerId, topMessage),
      from_id: fromId,
      peer_id: this.appPeersManager.getOutputPeer(peerId),
      post_author: postAuthor,
      pFlags: this.generateFlags(peerId),
      date: options.scheduleDate || (tsNow(true) + this.timeManager.getServerTimeOffset()),
      message: '',
      grouped_id: options.groupId,
      random_id: randomLong(),
      reply_to: this.generateReplyHeader(peerId, options.replyTo),
      via_bot_id: options.viaBotId,
      reply_markup: options.replyMarkup,
      replies: this.generateReplies(peerId, options.replyTo),
      views: isBroadcast && 1,
      pending: true,
      effect: options.effect,
      paid_message_stars: options.confirmedPaymentResult?.starsAmount || undefined,
      schedule_repeat_period: options.scheduleRepeatPeriod || undefined,
      saved_peer_id: options.replyToMonoforumPeerId ? this.appPeersManager.getOutputPeer(options.replyToMonoforumPeerId) : (peerId === this.appPeersManager.peerId ? this.appPeersManager.getOutputPeer(this.appPeersManager.peerId) : undefined),
      media,
      suggested_post: options.suggestedPost ? {
        _: 'suggestedPost',
        pFlags: {},
        price: options.suggestedPost.stars ? formatStarsAmount(options.suggestedPost.stars) : undefined,
        schedule_date: options.suggestedPost.timestamp && options.suggestedPost.timestamp >= tsNow(true) + SUGGESTED_POST_MIN_THRESHOLD_SECONDS ?
          options.suggestedPost.timestamp :
          undefined
      } : undefined
    };

    defineNotNumerableProperties(message, ['send', 'promise']);
    if(options.groupId === undefined) {
      message.promise = deferredPromise();
    }

    if(options.savedReaction) {
      message.reactions = {
        _: 'messageReactions',
        pFlags: {
          reactions_as_tags: true
        },
        results: options.savedReaction.map((reaction) => {
          return {
            _: 'reactionCount',
            count: 1,
            reaction,
            chosen_order: 0
          };
        })
      };
    }

    return message;
  }

  private generateTopicCreatedServiceMessage({peerId, title}: GenerateTopicCreatedServiceMessageArgs) {
    const iconColor = TOPIC_COLORS[Math.floor(Math.random() * TOPIC_COLORS.length)];

    const message = {
      _: 'messageService',
      pFlags: {
        out: true,
        reactions_are_possible: true
      },
      id: this.generateTempMessageId(peerId),
      random_id: randomLong(),
      from_id: this.appPeersManager.getOutputPeer(this.rootScope.myId),
      peer_id: this.appPeersManager.getOutputPeer(peerId),
      date: tsNow(true) + this.timeManager.getServerTimeOffset(),
      pending: true,
      action: {
        _: 'messageActionTopicCreate',
        pFlags: {
          title_missing: true
        },
        title: title,
        icon_color: iconColor
      }
    } satisfies Message.messageService;

    return message;
  }

  private generateReplyHeader(peerId: PeerId, replyTo: InputReplyTo): MessageReplyHeader {
    if(!replyTo) {
      return;
    }

    if(replyTo._ === 'inputReplyToMonoForum') {
      return;
    }

    if(replyTo._ === 'inputReplyToStory') {
      return {
        _: 'messageReplyStoryHeader',
        story_id: replyTo.story_id,
        peer: this.appPeersManager.getOutputPeer(this.appPeersManager.getPeerId(replyTo.peer))
      };
    }

    const replyWillBeInPeerId = peerId;
    const replyToPeerId = this.appPeersManager.getPeerId(replyTo.reply_to_peer_id);
    if(replyToPeerId) {
      peerId = replyToPeerId;
    }

    const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;
    const isForum = this.appPeersManager.isForum(peerId);
    const isBotforum = this.appPeersManager.isBotforum(peerId);
    const replyToMsgId = this.appMessagesIdsManager.generateMessageId(replyTo.reply_to_msg_id, channelId);
    let replyToTopId = replyTo.top_msg_id ? this.appMessagesIdsManager.generateMessageId(replyTo.top_msg_id, channelId) : undefined;
    const originalMessage = this.getMessageByPeer(peerId, replyToMsgId);

    if(isForum &&
