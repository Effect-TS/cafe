import {
  Command,
  ManagedResource,
  Subscription,
  click,
  expect,
  given,
  placeholder,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { ChatMessage } from '@cafe/api/chat/message'

import {
  ConnectionState,
  Message,
  Model,
  SendPrompt,
  SendState,
  managedResources,
  update,
  view,
} from './main'

const idleModel = Model.make({
  chatKeyInput: 'lobby',
  connection: ConnectionState.Disconnected(),
  messages: [],
  responses: [],
  promptInput: '',
  send: SendState.Idle(),
})

const connectedModel = modifyFields(idleModel, {
  connection: () => ConnectionState.Connected({ chatKey: 'lobby' }),
})

const chatMessage = (
  id: string,
  text: string,
  role: 'user' | 'assistant' = 'user',
) => ChatMessage.make({ id, key: 'lobby', role, text, sentAt: 0 })

describe('view', () => {
  test('initial view asks for a chat key', () => {
    scene(
      { update, view },
      given(idleModel),
      expect(text('Cafe Chat')).toExist(),
      expect(text('Pick a chat key to join')).toExist(),
      expect(placeholder('Chat key, e.g. lobby')).toHaveValue('lobby'),
      expect(role('button', { name: 'Join chat' })).toBeEnabled(),
    )
  })

  test('Join chat is disabled without a chat key', () => {
    scene(
      { update, view },
      given(idleModel),
      type(placeholder('Chat key, e.g. lobby'), '   '),
      expect(role('button', { name: 'Join chat' })).toBeDisabled(),
    )
  })

  test('joining a chat connects and shows the empty conversation', () => {
    scene(
      { update, view },
      given(idleModel),
      type(placeholder('Chat key, e.g. lobby'), 'kitchen'),
      click(role('button', { name: 'Join chat' })),
      expect(text('Connecting…')).toExist(),
      expect(text('Joining #kitchen…')).toExist(),
      ManagedResource.acquire(managedResources.chatSocket),
      expect(text('#kitchen')).toExist(),
      expect(
        text('No messages yet. Send a prompt to get started!'),
      ).toExist(),
      expect(placeholder('Type a prompt…')).toExist(),
    )
  })

  test('a failed connection shows the error and lets the user retry', () => {
    scene(
      { update, view },
      given(idleModel),
      click(role('button', { name: 'Join chat' })),
      ManagedResource.failAcquire(
        managedResources.chatSocket,
        new Error('Connection timeout'),
      ),
      expect(text('Connection Error')).toExist(),
      expect(text('Connection timeout')).toExist(),
      expect(role('button', { name: 'Join chat' })).toExist(),
    )
  })

  test('sending a prompt calls the API and clears the input', () => {
    scene(
      { update, view },
      given(connectedModel),
      expect(role('button', { name: 'Send' })).toBeDisabled(),
      type(placeholder('Type a prompt…'), 'hello'),
      expect(role('button', { name: 'Send' })).toBeEnabled(),
      click(role('button', { name: 'Send' })),
      Command.expectExact(SendPrompt({ chatKey: 'lobby', text: 'hello' })),
      expect(placeholder('Type a prompt…')).toHaveValue(''),
      Command.resolve(SendPrompt, Message.SucceededSendPrompt()),
    )
  })

  test('a failed send shows the error under the prompt', () => {
    scene(
      { update, view },
      given(connectedModel),
      type(placeholder('Type a prompt…'), 'hello'),
      click(role('button', { name: 'Send' })),
      Command.resolve(
        SendPrompt,
        Message.FailedSendPrompt({ error: 'Service unavailable' }),
      ),
      expect(text('Service unavailable')).toExist(),
    )
  })

  test('events from the socket render in order', () => {
    scene(
      { update, view },
      given(connectedModel),
      Subscription.emit(
        Message.ReceivedChatEvent({
          event: { _tag: 'MessagePosted', message: chatMessage('1', 'first') },
        }),
      ),
      Subscription.emit(
        Message.ReceivedChatEvent({
          event: {
            _tag: 'MessagePosted',
            message: chatMessage('2', 'second'),
          },
        }),
      ),
      expect(text('first')).toExist(),
      expect(text('second')).toExist(),
      expect(
        text('No messages yet. Send a prompt to get started!'),
      ).toBeAbsent(),
    )
  })

  test('leaving the chat returns to the chat key form', () => {
    scene(
      { update, view },
      given(connectedModel),
      click(role('button', { name: 'Leave' })),
      ManagedResource.release(managedResources.chatSocket),
      expect(text('Pick a chat key to join')).toExist(),
      expect(role('button', { name: 'Join chat' })).toExist(),
    )
  })

  test('an assistant response streams in and is replaced by the final message', () => {
    scene(
      { update, view },
      given(connectedModel),
      Subscription.emit(
        Message.ReceivedChatEvent({
          event: { _tag: 'ResponseDelta', responseId: 'r', text: 'Hello' },
        }),
      ),
      expect(text('Hello▍')).toExist(),
      Subscription.emit(
        Message.ReceivedChatEvent({
          event: { _tag: 'ResponseDelta', responseId: 'r', text: ' there' },
        }),
      ),
      expect(text('Hello there▍')).toExist(),
      Subscription.emit(
        Message.ReceivedChatEvent({
          event: {
            _tag: 'MessagePosted',
            message: chatMessage('r', 'Hello there', 'assistant'),
          },
        }),
      ),
      expect(text('Hello there')).toExist(),
      expect(text('Hello there▍')).toBeAbsent(),
    )
  })

  test('a failed response shows its error', () => {
    scene(
      { update, view },
      given(connectedModel),
      Subscription.emit(
        Message.ReceivedChatEvent({
          event: {
            _tag: 'ResponseFailed',
            responseId: 'r',
            error: 'model unavailable',
          },
        }),
      ),
      expect(text('Response failed: model unavailable')).toExist(),
    )
  })
})
