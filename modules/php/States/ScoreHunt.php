<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\EndScore;
use Bga\Games\StPatrick\States\NewRound;

/**
 * Подсчёт после охоты. Обычная охота: HP -= max(0, укусы − реликвии) [H4];
 * самопожертвование при 15 укусах одного игрока [H15]. Особая охота:
 * HP += min(max(0, реликвии − укусы), 1) [H6]. Конец игры — если у кого-то
 * HP <= 0 после охоты [H7].
 */
class ScoreHunt extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 12, type: StateType::GAME, updateGameProgression: true);
    }

    public function onEnteringState(int $activePlayerId)
    {
        $pids = $this->game->playerIds();
        $bites = [];
        $relics = [];
        foreach ($pids as $pid) {
            $bites[$pid] = $this->game->bitesOf($pid);
            $relics[$pid] = $this->game->relicCount($pid);
            $this->bga->playerStats->set('bites_taken', $bites[$pid], $pid);
            $this->bga->playerStats->set('relics_taken', $relics[$pid], $pid);
        }

        if ($this->bga->globals->get('special_hunt')) {
            $gains = [];
            foreach ($pids as $pid) {
                $gains[$pid] = min(max(0, $relics[$pid] - $bites[$pid]), 1);
                if ($gains[$pid] > 0) {
                    $this->bga->playerScore->inc($pid, $gains[$pid]);
                }
            }
            $this->notify->all('specialScored', clienttranslate('Special hunt scoring'), [
                'bites' => $bites,
                'relics' => $relics,
                'gains' => $gains,
            ]);
        } else {
            $victims = array_keys(array_filter($bites, fn($b) => $b === Game::TOTAL_BITES));
            if (count($victims) === 1) {
                $saint = (int)$victims[0];
                foreach ($pids as $pid) {
                    if ($pid !== $saint) {
                        $this->bga->playerScore->inc($pid, -Game::SACRIFICE_PENALTY);
                    }
                }
                $this->notify->all('sacrifice', clienttranslate('${player_name} took all 15 bites — everyone else loses 3 life!'), [
                    'player_id' => $saint,
                    'player_name' => $this->game->getPlayerNameById($saint),
                    'bites' => $bites,
                ]);
            } else {
                $losses = [];
                foreach ($pids as $pid) {
                    $losses[$pid] = max(0, $bites[$pid] - $relics[$pid]);
                    if ($losses[$pid] > 0) {
                        $this->bga->playerScore->inc($pid, -$losses[$pid]);
                    }
                }
                $this->notify->all('huntScored', clienttranslate('Hunt scoring'), [
                    'bites' => $bites,
                    'relics' => $relics,
                    'losses' => $losses,
                ]);
            }
        }

        foreach ($this->game->playerIds() as $pid) {
            if ($this->bga->playerScore->get($pid) <= 0) {
                return EndScore::class;
            }
        }
        return NewRound::class;
    }
}
