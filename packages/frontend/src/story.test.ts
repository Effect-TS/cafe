import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import {
  ConnectionState,
  Message,
  Model,
  SendPrompt,
  SendState,
  update,
} from './main'

const idleModel = Model.make({
  chatKeyInput: 'lobby',
  connection: ConnectionState.Disconnected(),
  messages: [],
  promptInput: '',
  send: SendState.Idle(),
})

const connectingModel = modifyFields(idleModel, {
  connection: () => ConnectionState.Connecting({ chatKey: 'lobby' }),
})

const connectedModel = modifyFields(idleModel, {
  connection: () => ConnectionState.Connected({ chatKey: 'lobby' }),
})

const chatMessage = {
  id: '1',
  key: 'lobby',
  text: 'hi',
  sentAt: 0,
}

describe('update', () => {
  describe('joining a chat', () => {
    test('SubmittedChatKey starts connecting to the trimmed key', () => {
      story(
        update,
        given(modifyFields(idleModel, { chatKeyInput: () => '  kitchen  ' })),
        message(Message.SubmittedChatKey()),
        model(model => {
          expect(model.connection).toEqual(
            ConnectionState.Connecting({ chatKey: 'kitchen' }),
          )
        }),
      )
    })

    test('SubmittedChatKey ignores a blank key', () => {
      story(
        update,
        given(modifyFields(idleModel, { chatKeyInput: () => '   ' })),
        message(Message.SubmittedChatKey()),
        model(model => {
          expect(model.connection._tag).toBe('Disconnected')
        }),
      )
    })

    test('SubmittedChatKey clears messages from a previous chat', () => {
      story(
        update,
        given(modifyFields(idleModel, { messages: () => [chatMessage] })),
        message(Message.SubmittedChatKey()),
        model(model => {
          expect(model.messages).toEqual([])
        }),
      )
    })

    test('Connected moves Connecting to Connected for the same key', () => {
      story(
        update,
        given(connectingModel),
        message(Message.Connected()),
        model(model => {
          expect(model.connection).toEqual(
            ConnectionState.Connected({ chatKey: 'lobby' }),
          )
        }),
      )
    })

    test('Connected is ignored unless connecting', () => {
      story(
        update,
        given(idleModel),
        message(Message.Connected()),
        model(model => {
          expect(model.connection._tag).toBe('Disconnected')
        }),
      )
    })

    test('FailedConnect records the error', () => {
      story(
        update,
        given(connectingModel),
        message(Message.FailedConnect({ error: 'Timeout' })),
        model(model => {
          expect(model.connection).toEqual(
            ConnectionState.Error({ error: 'Timeout' }),
          )
        }),
      )
    })
  })

  describe('leaving a chat', () => {
    test('ClickedDisconnect disconnects', () => {
      story(
        update,
        given(connectedModel),
        message(Message.ClickedDisconnect()),
        model(model => {
          expect(model.connection._tag).toBe('Disconnected')
        }),
      )
    })

    test('Disconnected disconnects', () => {
      story(
        update,
        given(connectedModel),
        message(Message.Disconnected()),
        model(model => {
          expect(model.connection._tag).toBe('Disconnected')
        }),
      )
    })
  })

  describe('sending a prompt', () => {
    test('SubmittedPrompt sends the trimmed prompt to the connected key', () => {
      story(
        update,
        given(modifyFields(connectedModel, { promptInput: () => '  hello  ' })),
        message(Message.SubmittedPrompt()),
        model(model => {
          expect(model.promptInput).toBe('')
          expect(model.send._tag).toBe('Sending')
        }),
        Command.expectExact(SendPrompt({ chatKey: 'lobby', text: 'hello' })),
        Command.resolve(SendPrompt, Message.SucceededSendPrompt()),
        model(model => {
          expect(model.send._tag).toBe('Idle')
        }),
      )
    })

    test('SubmittedPrompt ignores a blank prompt', () => {
      story(
        update,
        given(modifyFields(connectedModel, { promptInput: () => '   ' })),
        message(Message.SubmittedPrompt()),
        Command.expectNone(),
        model(model => {
          expect(model.send._tag).toBe('Idle')
        }),
      )
    })

    test('SubmittedPrompt does nothing while not connected', () => {
      story(
        update,
        given(modifyFields(connectingModel, { promptInput: () => 'hello' })),
        message(Message.SubmittedPrompt()),
        Command.expectNone(),
        model(model => {
          expect(model.promptInput).toBe('hello')
        }),
      )
    })

    test('FailedSendPrompt records the error', () => {
      story(
        update,
        given(modifyFields(connectedModel, { promptInput: () => 'hello' })),
        message(Message.SubmittedPrompt()),
        Command.resolve(
          SendPrompt,
          Message.FailedSendPrompt({ error: 'Service unavailable' }),
        ),
        model(model => {
          expect(model.send).toEqual(
            SendState.Failed({ error: 'Service unavailable' }),
          )
        }),
      )
    })
  })

  describe('receiving events', () => {
    test('ReceivedChatEvent appends posted messages in order', () => {
      const second = { ...chatMessage, id: '2', text: 'there' }

      story(
        update,
        given(connectedModel),
        message(
          Message.ReceivedChatEvent({
            event: { _tag: 'MessagePosted', message: chatMessage },
          }),
        ),
        message(
          Message.ReceivedChatEvent({
            event: { _tag: 'MessagePosted', message: second },
          }),
        ),
        model(model => {
          expect(model.messages).toEqual([chatMessage, second])
        }),
      )
    })
  })
})
