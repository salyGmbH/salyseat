<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\WhatsApp;

use App\Module\WhatsApp\Application\Service\ReplyTextParser;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ReplyTextParserTest extends TestCase
{
    private ReplyTextParser $parser;

    protected function setUp(): void
    {
        $this->parser = new ReplyTextParser();
    }

    #[DataProvider('partySizeCases')]
    public function testParsePartySize(string $text, ?int $expected): void
    {
        self::assertSame($expected, $this->parser->parsePartySize($text));
    }

    public static function partySizeCases(): iterable
    {
        yield ['4', 4];
        yield ['für 4 Personen bitte', 4];
        yield ['  12  ', 12];
        yield ['0', null];
        yield ['51', null];
        yield ['Hallo', null];
        yield ['', null];
    }

    #[DataProvider('yesNoCases')]
    public function testParseYesNo(string $text, ?bool $expected): void
    {
        self::assertSame($expected, $this->parser->parseYesNo($text));
    }

    public static function yesNoCases(): iterable
    {
        yield ['ja', true];
        yield ['Ja klar', true];
        yield ['passt', true];
        yield ['OK', true];
        yield ['nein', false];
        yield ['Nein danke', false];
        yield ['stop', false];
        yield ['vielleicht', null];
        yield ['', null];
    }

    public function testParseDateRecognizesHeuteAndMorgen(): void
    {
        $now = new \DateTimeImmutable('2026-11-20');

        self::assertEquals($now, $this->parser->parseDate('heute', $now));
        self::assertEquals($now->modify('+1 day'), $this->parser->parseDate('morgen bitte', $now));
        self::assertEquals($now->modify('+2 days'), $this->parser->parseDate('übermorgen', $now));
    }

    public function testParseDateRecognizesExplicitDateWithYear(): void
    {
        $now = new \DateTimeImmutable('2026-11-20');

        self::assertEquals(
            new \DateTimeImmutable('2026-12-24'),
            $this->parser->parseDate('am 24.12.2026', $now),
        );
    }

    public function testParseDateWithoutYearRollsOverToNextYearWhenInPast(): void
    {
     
        $now = new \DateTimeImmutable('2026-11-20');

        self::assertEquals(
            new \DateTimeImmutable('2027-01-01'),
            $this->parser->parseDate('01.01.', $now),
        );
    }

    public function testParseDateRecognizesWeekdayName(): void
    {
        $now = new \DateTimeImmutable('2026-11-20');

        $result = $this->parser->parseDate('montag', $now);

        self::assertNotNull($result);
        self::assertSame('2026-11-20', $result->format('Y-m-d'));
        self::assertSame('1', $result->format('N'));
    }

    public function testParseDateReturnsNullForGibberish(): void
    {
        self::assertNull($this->parser->parseDate('blabla', new \DateTimeImmutable('2026-11-20')));
    }

    public function testParseTimeSelectionByNumber(): void
    {
        $offered = ['18:00', '18:30', '19:00'];

        self::assertSame('19:00', $this->parser->parseTimeSelection('3', $offered));
        self::assertSame('18:00', $this->parser->parseTimeSelection('1', $offered));
        self::assertNull($this->parser->parseTimeSelection('9', $offered));
    }

    public function testParseTimeSelectionByExactTime(): void
    {
        $offered = ['18:00', '18:30', '19:00'];

        self::assertSame('18:30', $this->parser->parseTimeSelection('18:30', $offered));
        self::assertSame('18:30', $this->parser->parseTimeSelection('18.30 Uhr bitte', $offered));
        self::assertNull($this->parser->parseTimeSelection('20:00', $offered));
    }
}