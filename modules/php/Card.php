<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick;

use Bga\GameFramework\Components\ItemManager\Item;
use Bga\GameFramework\Components\ItemManager\ItemField;
use Bga\GameFramework\Components\ItemManager\ItemFieldKind;

#[Item]
class Card
{
    #[ItemField(kind: ItemFieldKind::ID)]
    public int $id;

    #[ItemField(kind: ItemFieldKind::LOCATION, locationIndex: 0)]
    public string $location;

    #[ItemField(kind: ItemFieldKind::LOCATION, locationIndex: 1)]
    public ?int $locationArg;

    #[ItemField(kind: ItemFieldKind::ORDER)]
    public int $order;

    #[ItemField]
    public int $suit; // Game::SUIT_*

    #[ItemField]
    public int $value; // 1..9
}
