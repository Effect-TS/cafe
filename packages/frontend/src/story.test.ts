import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import {
  ConnectionState,
  Message,
  type Model,
  SendPrompt,
  SendState,
  update,
} from './main'

const idleModel: Model = {
  chatKeyInput: 'lobby',
  connection: ConnectionState.Disconnected(),
  messages: [],
  promptInput: '',
  send: SendState.Idle(),
}

const connectedModel: Model = modifyFields(idleModel, {
  connection: () => ConnectionState.Connected({ chatKey: 'lobby' }),
})

describe('update', () => {
  test('SubmittedChatKey starts connecting to that key', () => {
    story(
      update,
      given(idleModel),
      message(Message.SubmittedChatKey()),
      model(model => {
        expect(model.connection).toEqual(
          ConnectionState.Connecting({ chatKey: 'lobby' }),
        )
      }),
    )
  })

  test('SubmittedPrompt sends the prompt to the connected key', () => {
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

  test('ReceivedChatEvent appends posted messages', () => {
    const chatMessage = {
      id: '1',
      key: 'lobby',
      text: 'hi',
      sentAt: 0,
    }

    story(
      update,
      given(connectedModel),
      message(
        Message.ReceivedChatEvent({
          event: { _tag: 'MessagePosted', message: chatMessage },
        }),
      ),
      model(model => {
        expect(model.messages).toEqual([chatMessage])
      }),
    )
  })
})
