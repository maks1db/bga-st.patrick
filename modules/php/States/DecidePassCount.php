<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\StPatrick\Game;
use Bga\Games\StPatrick\States\DraftRelics;
use Bga\Games\StPatrick\States\PassCards;

/**
 * Раунды 2+: единственный игрок с минимумом HP выбирает, сколько карт (0/1/2)
 * передадут все игроки соседям слева [H8].
 */
class DecidePassCount extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct($game, id: 3, type: StateType::ACTIVE_PLAYER);
    }

    #[PossibleAction]
    public function actSetPassCount(int $count, int $activePlayerId): string
    {
        if (!in_array($count, [0, 1, 2], true)) {
            throw new UserException(clienttranslate('Invalid number of cards'));
        }
        $this->bga->globals->set('pass_count', $count);
        $this->notify->all('passCountDecided', clienttranslate('${player_name} decided: everyone passes ${count} card(s)'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'count' => $count,
        ]);

        if ($count === 0) {
            $this->gamestate->changeActivePlayer($this->game->findPatrickHolder());
            return DraftRelics::class;
        }
        $this->gamestate->setAllPlayersMultiactive();
        return PassCards::class;
    }

    public function zombie(int $playerId): string
    {
        return $this->actSetPassCount((int)bga_rand(0, 2), $playerId);
    }
}
