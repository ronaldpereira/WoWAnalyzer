import React from 'react';

import Analyzer from 'parser/core/Analyzer';
import SPELLS from 'common/SPELLS';
import SpellLink from 'common/SpellLink';
import ItemDamageDone from 'interface/ItemDamageDone';
import calculateEffectiveDamage from 'parser/core/calculateEffectiveDamage';
import StatTracker from 'parser/shared/modules/StatTracker';
import GlobalCooldown from 'parser/shared/modules/GlobalCooldown';
import { RAPTOR_MONGOOSE_VARIANTS, VIPERS_VENOM_DAMAGE_MODIFIER } from 'parser/hunter/survival/constants';
import Statistic from 'interface/statistics/Statistic';
import STATISTIC_CATEGORY from 'interface/others/STATISTIC_CATEGORY';
import STATISTIC_ORDER from 'interface/others/STATISTIC_ORDER';
import BoringSpellValueText from 'interface/statistics/components/BoringSpellValueText';
import { ApplyBuffEvent, CastEvent, DamageEvent, RefreshBuffEvent } from 'parser/core/Events';

/**
 * Raptor Strike (or Mongoose Bite) has a chance to make your next Serpent Sting cost no Focus and deal an additional 250% initial damage.
 *
 * Example log:
 * https://www.warcraftlogs.com/reports/ZRALzNbMpqka1fTB#fight=17&type=auras&source=329&translate=true&ability=268552
 */

class VipersVenom extends Analyzer {
  static dependencies = {
    statTracker: StatTracker,
    globalCooldown: GlobalCooldown,
  };

  protected statTracker!: StatTracker;
  protected globalCooldown!: GlobalCooldown;


  buffedSerpentSting = false;
  bonusDamage = 0;
  procs = 0;
  lastProcTimestamp = 0;
  accumulatedTimeFromBuffToCast = 0;
  currentGCD = 0;
  wastedProcs = 0;
  badRaptorsOrMBs = 0;
  spellKnown = SPELLS.RAPTOR_STRIKE;

  constructor(options: any) {
    super(options);
    this.active = this.selectedCombatant.hasTalent(SPELLS.VIPERS_VENOM_TALENT.id);
    if (this.active && this.selectedCombatant.hasTalent(SPELLS.MONGOOSE_BITE_TALENT.id)) {
      this.spellKnown = SPELLS.MONGOOSE_BITE_TALENT;
    }
  }

  on_byPlayer_cast(event: CastEvent) {
    const spellId = event.ability.guid;
    if ((!RAPTOR_MONGOOSE_VARIANTS.includes(spellId) && spellId !== SPELLS.SERPENT_STING_SV.id) || !this.selectedCombatant.hasBuff(SPELLS.VIPERS_VENOM_BUFF.id)) {
      return;
    }
    if (spellId === SPELLS.SERPENT_STING_SV.id) {
      this.buffedSerpentSting = true;
      this.currentGCD = this.globalCooldown.getGlobalCooldownDuration(spellId);
      this.accumulatedTimeFromBuffToCast += event.timestamp - this.lastProcTimestamp - this.currentGCD;
      return;
    }
    if (RAPTOR_MONGOOSE_VARIANTS.includes(spellId)) {
      this.badRaptorsOrMBs += 1;
    }
  }

  on_byPlayer_damage(event: DamageEvent) {
    const spellId = event.ability.guid;
    if (spellId !== SPELLS.SERPENT_STING_SV.id || !this.buffedSerpentSting) {
      return;
    }
    this.bonusDamage += calculateEffectiveDamage(event, VIPERS_VENOM_DAMAGE_MODIFIER);
    this.buffedSerpentSting = false;
  }

  on_byPlayer_applybuff(event: ApplyBuffEvent) {
    const spellId = event.ability.guid;
    if (spellId !== SPELLS.VIPERS_VENOM_BUFF.id) {
      return;
    }
    this.procs += 1;
    this.lastProcTimestamp = event.timestamp;
  }

  on_byPlayer_refreshbuff(event: RefreshBuffEvent) {
    const spellId = event.ability.guid;
    if (spellId !== SPELLS.VIPERS_VENOM_BUFF.id) {
      return;
    }
    this.wastedProcs += 1;
  }

  get averageTimeBetweenBuffAndUsage() {
    return this.accumulatedTimeFromBuffToCast / this.procs / 1000;
  }

  get raptorWithBuffThresholds() {
    return {
      actual: this.badRaptorsOrMBs,
      isGreaterThan: {
        minor: 1,
        average: 2,
        major: 3,
      },
      style: 'number',
    };
  }

  get wastedProcsThresholds() {
    return {
      actual: this.wastedProcs,
      isGreaterThan: {
        minor: 0,
        average: 2,
        major: 4,
      },
      style: 'number',
    };
  }

  suggestions(when: any) {
    when(this.raptorWithBuffThresholds).addSuggestion((suggest: any, actual: any, recommended: any) => {
      return suggest(<>Remember to cast <SpellLink id={SPELLS.SERPENT_STING_SV.id} /> after proccing <SpellLink id={SPELLS.VIPERS_VENOM_TALENT.id} /> before you cast <SpellLink id={this.spellKnown.id} /> again.</>)
        .icon(SPELLS.VIPERS_VENOM_TALENT.icon)
        .actual(`${actual} raptor casts with Viper's Venom buff active`)
        .recommended(`<${recommended} casts is recommended`);
    });
    when(this.wastedProcsThresholds).addSuggestion((suggest: any, actual: any, recommended: any) => {
      return suggest(<>Remember to utilise all your <SpellLink id={SPELLS.VIPERS_VENOM_TALENT.id} /> procs, and to not cast <SpellLink id={this.spellKnown.id} /> before you've spent the <SpellLink id={SPELLS.VIPERS_VENOM_TALENT.id} /> buff.</>)
        .icon(SPELLS.VIPERS_VENOM_TALENT.icon)
        .actual(`${actual} wasted procs of Viper's Venom`)
        .recommended(`<${recommended} is recommended`);
    });
  }

  statistic() {
    return (
      <Statistic
        position={STATISTIC_ORDER.OPTIONAL(1)}
        size="flexible"
        tooltip={(
          <>
            <ul>
              <li>Average time between gaining Viper's Venom buff and using it was <b>{this.averageTimeBetweenBuffAndUsage.toFixed(2)}</b> seconds.
                <ul>
                  <li>Note: This accounts for the GCD after the {this.spellKnown.name} proccing Viper's Venom.</li>
                  {this.wastedProcs > 0 && <li>You wasted {this.wastedProcs} procs by gaining a new proc, whilst your current proc was still active.</li>}
                </ul>
              </li>
            </ul>
          </>
        )}
        category={STATISTIC_CATEGORY.TALENTS}
      >
        <BoringSpellValueText spell={SPELLS.VIPERS_VENOM_TALENT}>
          <>
            <ItemDamageDone amount={this.bonusDamage} /><br />
            {this.procs} / {this.wastedProcs + this.procs} <small>procs used</small>
          </>
        </BoringSpellValueText>
      </Statistic>
    );
  }
}

export default VipersVenom;
