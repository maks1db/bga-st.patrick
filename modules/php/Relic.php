<?php

declare(strict_types=1);

namespace Bga\Games\StPatrick;

use Bga\GameFramework\Components\ItemManager\Item;
use Bga\GameFramework\Components\ItemManager\ItemField;
use Bga\GameFramework\Components\ItemManager\ItemFieldKind;

#[Item]
class Relic
{
    #[ItemField(kind: ItemFieldKind::ID)]
    public int $id;

    #[ItemField(kind: ItemFieldKind::LOCATION, locationIndex: 0)]
    public string $location; // 'center' or 'held'

    #[ItemField(kind: ItemFieldKind::LOCATION, locationIndex: 1)]
    public ?int $locationArg; // player id when held

    #[ItemField(kind: ItemFieldKind::ORDER)]
    public int $order;
}
