import React from 'react';
import Analyzer from 'parser/core/Analyzer';
import { formatNumber, formatPercentage } from 'common/format';
import { calculateAzeriteEffects } from 'common/stats';
import SPELLS from 'common/SPELLS/index';
import StatTracker from 'parser/shared/modules/StatTracker';
import BoringSpellValueText from 'interface/statistics/components/BoringSpellValueText';
import STATISTIC_CATEGORY from 'interface/others/STATISTIC_CATEGORY';
import Agility from 'interface/icons/Agility';
import UptimeIcon from 'interface/icons/Uptime';
import Statistic from 'interface/statistics/Statistic';

const danceOfDeathStats = (traits: number[]) => Object.values(traits).reduce((obj: { agility: number }, rank) => {
  const [agility] = calculateAzeriteEffects(SPELLS.DANCE_OF_DEATH.id, rank);
  obj.agility += agility;
  return obj;
}, {
  agility: 0,
});

/**
 * Barbed Shot has a chance equal to your critical strike chance to grant you 314 agility for 8 sec.
 *
 * Example log:
 * https://www.warcraftlogs.com/reports/dhvBkQtHmJ23bYA4#fight=6&type=auras&source=10&ability=274443
 */
class DanceOfDeath extends Analyzer {
  static dependencies = {
    statTracker: StatTracker,
  };

  agility = 0;

  protected statTracker!: StatTracker;

  constructor(options: any) {
    super(options);
    this.active = this.selectedCombatant.hasTrait(SPELLS.DANCE_OF_DEATH.id);
    if (!this.active) {
      return;
    }
    const { agility } = danceOfDeathStats(this.selectedCombatant.traitsBySpellId[SPELLS.DANCE_OF_DEATH.id]);
    this.agility = agility;

    options.statTracker.add(SPELLS.DANCE_OF_DEATH_BUFF.id, {
      agility: this.agility,
    });
  }

  get uptime() {
    return this.selectedCombatant.getBuffUptime(SPELLS.DANCE_OF_DEATH_BUFF.id) / this.owner.fightDuration;
  }

  get avgAgility() {
    return this.uptime * this.agility;
  }

  statistic() {
    return (
      <Statistic
        size="flexible"
        category={STATISTIC_CATEGORY.AZERITE_POWERS}
        tooltip={(
          <>
            Dance of Death granted <strong>{formatNumber(this.agility)}</strong> Agility for <strong>{formatPercentage(this.uptime)}%</strong> of the fight.
          </>
        )}
      >
        <BoringSpellValueText spell={SPELLS.DANCE_OF_DEATH}>
          <>
            <Agility /> {formatNumber(this.avgAgility)} <small> average Agility</small> <br />
            <UptimeIcon /> {formatPercentage(this.uptime)}% <small>uptime</small>
          </>
        </BoringSpellValueText>
      </Statistic>
    );
  }
}

export default DanceOfDeath;
