import { describe, expect, test } from 'bun:test'
import { buildAttackDiceResult } from './attack-dice-result'

describe('buildAttackDiceResult', () => {
  test('builds the visible dice result directly from a live attack mutation', () => {
    expect(
      buildAttackDiceResult(
        [
          {
            type: 'AttackResolved',
            from: 'alaska',
            to: 'kamchatka',
            attackRolls: [6, 4, 1],
            defendRolls: [5, 4],
            attackerLosses: 1,
            defenderLosses: 1,
          },
        ],
        {
          alaska: { name: 'Alaska' },
          kamchatka: { name: 'Kamchatka' },
        },
        'version-12',
        { attacker: '#ef4444', defender: '#38bdf8' },
      ),
    ).toEqual({
      key: 'version-12',
      fromId: 'alaska',
      toId: 'kamchatka',
      fromLabel: 'Alaska',
      toLabel: 'Kamchatka',
      attackRolls: [6, 4, 1],
      defendRolls: [5, 4],
      attackerLosses: 1,
      defenderLosses: 1,
      attackerColor: '#ef4444',
      defenderColor: '#38bdf8',
    })
  })
})

describe('untrusted and legacy attack events', () => {
  const colors = { attacker: 'red', defender: 'blue' }

  const attack = {
    type: 'AttackResolved',
    from: 'a',
    to: 'b',
    attackRolls: [6, '5', null, 2],
    defendRolls: [true, 3],
  }

  test('ignores unrelated unknown values and preserves numeric filtering and legacy defaults', () => {
    const result = buildAttackDiceResult([null, 1, {}, attack, { type: 'Other' }], {}, 'k', colors)
    expect(result).toMatchObject({
      fromLabel: 'a',
      toLabel: 'b',
      attackRolls: [6, 2],
      defendRolls: [3],
      attackerLosses: 0,
      defenderLosses: 0,
    })
  })

  test('does not fall back to an older attack when the latest attack is malformed', () => {
    expect(buildAttackDiceResult([attack, { ...attack, from: 1 }], {}, 'k', colors)).toBeNull()
    expect(buildAttackDiceResult([{ ...attack, attackRolls: ['6'] }], {}, 'k', colors)).toBeNull()
    expect(buildAttackDiceResult([{ type: 'AttackResolved' }], {}, 'k', colors)).toBeNull()
  })
})
