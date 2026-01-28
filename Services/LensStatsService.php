<?php

/**
 * Insight Lens - Statistics Service
 */

declare(strict_types=1);

namespace WebtreesLens\Services;

use Fisharebest\Algorithm\MyersDiff;
use Fisharebest\Webtrees\DB;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Tree;
use Illuminate\Support\Collection;

class LensStatsService
{
    /**
     * Apply date filtering to a query (supports both "Last X days" and "Selected years" modes)
     *
     * @param \Illuminate\Database\Query\Builder $query
     * @param int|null $days Number of days to look back (null = not using this mode)
     * @param array<int> $years Array of years to include (empty = not using this mode)
     * @param string $dateColumn Column name to filter on
     *
     * @return \Illuminate\Database\Query\Builder
     */
    private function applyDateFilter($query, ?int $days, array $years, string $dateColumn = 'change.change_time')
    {
        if ($days !== null && $days > 0) {
            // Mode: Last X days
            $query->where($dateColumn, '>', date('Y-m-d H:i:s', strtotime("-{$days} days")));
        } elseif (!empty($years)) {
            // Mode: Selected years
            $query->where(function ($q) use ($years, $dateColumn) {
                foreach ($years as $year) {
                    $q->orWhereBetween($dateColumn, [
                        "{$year}-01-01 00:00:00",
                        "{$year}-12-31 23:59:59"
                    ]);
                }
            });
        }
        // else: no filter, full history

        return $query;
    }

    /**
     * Get statistics about changes by tree
     *
     * @param int|null $days Number of days to analyze (null/0 = use years or all time)
     * @param array<int> $years Array of years to include (empty = use days or all time)
     * @param array<int> $userIds Filter by user IDs (empty = all users)
     *
     * @return array<string,int> Tree name => count
     */
    public function getChangesByTree(?int $days = null, array $years = [], array $userIds = []): array
    {
        $query = DB::table('change')
            ->join('gedcom', 'gedcom.gedcom_id', '=', 'change.gedcom_id')
            ->where('status', '=', 'accepted')
            ->where('new_gedcom', '<>', '')
            ->select(['gedcom_name', DB::raw('COUNT(*) as count')]);

        // Use unified date filter
        $query = $this->applyDateFilter($query, $days, $years, 'change_time');

        if (!empty($userIds)) {
            $query->whereIn('user_id', $userIds);
        }

        $results = $query->groupBy('gedcom_name')->get();

        $stats = [];
        foreach ($results as $row) {
            $stats[$row->gedcom_name] = (int) $row->count;
        }

        arsort($stats);
        return $stats;
    }

    /**
     * Extract edited facts from GEDCOM comparison
     *
     * @param string $oldGedcom
     * @param string $newGedcom
     *
     * @return array<string> List of fact tags that were edited
     */
    private function extractEditedFacts(string $oldGedcom, string $newGedcom): array
    {
        $oldFacts = $this->extractFactTags($oldGedcom);
        $newFacts = $this->extractFactTags($newGedcom);

        // Facts that appear in both but may have been modified
        return array_values(array_intersect($oldFacts, $newFacts));
    }

    /**
     * Extract added facts from GEDCOM comparison
     *
     * @param string $oldGedcom
     * @param string $newGedcom
     *
     * @return array<string> List of fact tags that were added
     */
    private function extractAddedFacts(string $oldGedcom, string $newGedcom): array
    {
        $oldFacts = $this->extractFactTags($oldGedcom);
        $newFacts = $this->extractFactTags($newGedcom);

        // Count occurrences of each fact type
        $oldCounts = array_count_values($oldFacts);
        $newCounts = array_count_values($newFacts);

        $added = [];
        foreach ($newCounts as $fact => $newCount) {
            $oldCount = $oldCounts[$fact] ?? 0;
            $addedCount = $newCount - $oldCount;

            // If more facts exist in new than in old, record the additions
            if ($addedCount > 0) {
                for ($i = 0; $i < $addedCount; $i++) {
                    $added[] = $fact;
                }
            }
        }

        return $added;
    }

    /**
     * Extract deleted facts from GEDCOM comparison
     *
     * @param string $oldGedcom
     * @param string $newGedcom
     *
     * @return array<string> List of fact tags that were deleted
     */
    private function extractDeletedFacts(string $oldGedcom, string $newGedcom): array
    {
        $oldFacts = $this->extractFactTags($oldGedcom);
        $newFacts = $this->extractFactTags($newGedcom);

        // Count occurrences of each fact type
        $oldCounts = array_count_values($oldFacts);
        $newCounts = array_count_values($newFacts);

        $deleted = [];
        foreach ($oldCounts as $fact => $oldCount) {
            $newCount = $newCounts[$fact] ?? 0;
            $deletedCount = $oldCount - $newCount;

            // If more facts existed in old than in new, record the deletions
            if ($deletedCount > 0) {
                for ($i = 0; $i < $deletedCount; $i++) {
                    $deleted[] = $fact;
                }
            }
        }

        return $deleted;
    }

    /**
     * Extract GEDCOM fact tags from GEDCOM text
     *
     * @param string $gedcom
     *
     * @return array<string> List of fact tags (BIRT, DEAT, NAME, etc.)
     */
    private function extractFactTags(string $gedcom): array
    {
        $facts = [];
        $lines = explode("\n", $gedcom);

        // Technical tags that should be excluded from statistics
        $excludedTags = ['CHAN', 'OBJE', '_UID', 'RIN', 'REFN', 'RFN', 'AFN'];

        foreach ($lines as $line) {
            // Match level 1 GEDCOM tags (e.g., "1 BIRT", "1 NAME", etc.)
            if (preg_match('/^1 ([A-Z]{3,5}|_[A-Z]+)/', $line, $matches)) {
                $tag = $matches[1];
                // Exclude technical/system tags
                if (!in_array($tag, $excludedTags, true)) {
                    $facts[] = $tag;
                }
            }
        }

        return $facts;
    }

    /**
     * Determine record type from GEDCOM
     *
     * Modern webtrees uses 'X' prefix for all record types, so we need to parse
     * the GEDCOM to find the actual record type (INDI, FAM, SOUR, etc.)
     * Old records may still use type-specific prefixes (I, F, S, etc.)
     *
     * @param string $xref Record identifier
     * @param string $gedcom GEDCOM content to parse
     *
     * @return string Human-readable record type
     */
    private function getRecordType(string $xref, string $gedcom): string
    {
        // Parse GEDCOM to find record type (e.g., "0 @X123@ INDI")
        // Format: 0 @XREF@ TYPE
        if (preg_match('/^0\s+@[^@]+@\s+([A-Z_]+)/m', $gedcom, $matches)) {
            return $this->mapGedcomTypeToLabel($matches[1]);
        }

        // Fallback: try to determine from XREF prefix (for old records)
        // Note: Return English identifiers for internal consistency (translations done in JS)
        if (preg_match('/^([IFSRMNOLHX])/', $xref, $matches)) {
            return match ($matches[1]) {
                'I' => 'Individual',
                'F' => 'Family',
                'S' => 'Source',
                'R' => 'Repository',
                'M' => 'Media object',
                'N' => 'Note',
                'O' => 'Submitter',
                'L' => 'Location',
                'H' => 'Other', // Header
                'X' => 'Other', // Unknown - shouldn't happen if GEDCOM parsing worked
                default => 'Other',
            };
        }

        return 'Other';
    }

    /**
     * Map GEDCOM record type to label
     *
     * @param string $gedcomType GEDCOM type (INDI, FAM, SOUR, etc.)
     *
     * @return string English label (translations done in JavaScript presentation layer)
     */
    private function mapGedcomTypeToLabel(string $gedcomType): string
    {
        return match ($gedcomType) {
            'INDI' => 'Individual',
            'FAM' => 'Family',
            'SOUR' => 'Source',
            'REPO' => 'Repository',
            'OBJE' => 'Media object',
            'NOTE', 'SNOTE' => 'Note',
            'SUBM' => 'Submitter',
            'SUBN' => 'Submission',
            '_LOC' => 'Location',
            'HEAD' => 'Other',
            default => 'Other',
        };
    }

    /**
     * Get editing activity over time (weekly aggregation)
     * Shows how work intensity changes over time
     *
     * @param Tree|null $tree Specific tree or all trees
     * @param int|null $days Number of days to analyze (null = not using this mode)
     * @param array<int> $years Array of years to include (empty = not using this mode)
     * @param array<int> $userIds Filter by user IDs (empty = all users)
     *
     * @return array<string,int> "YYYY-Www" => count
     */
    public function getEditingActivityOverTime(?Tree $tree = null, ?int $days = null, array $years = [], array $userIds = []): array
    {
        $query = DB::table('change')
            ->where('status', '=', 'accepted')
            ->where('new_gedcom', '<>', '')
            ->select([
                DB::raw('YEARWEEK(change_time, 1) as yearweek'),
                DB::raw('COUNT(*) as count')
            ]);

        if ($tree !== null) {
            $query->where('gedcom_id', '=', $tree->id());
        }

        // Apply date filter (Last X days OR Selected years)
        $query = $this->applyDateFilter($query, $days, $years, 'change_time');

        if (!empty($userIds)) {
            $query->whereIn('user_id', $userIds);
        }

        $results = $query->groupBy('yearweek')->orderBy('yearweek')->get();

        $stats = [];
        foreach ($results as $row) {
            // Convert YEARWEEK (202401) to readable format (2024-W01)
            $yearweek = (string) $row->yearweek;
            $year = substr($yearweek, 0, 4);
            $week = substr($yearweek, 4);
            $label = $year . '-W' . str_pad($week, 2, '0', STR_PAD_LEFT);
            $stats[$label] = (int) $row->count;
        }

        return $stats;
    }

    /**
     * Get list of users who have made changes
     *
     * @param Tree|null $tree Specific tree or all trees
     *
     * @return array<int,string> User ID => User name
     */
    public function getUsersWithChanges(?Tree $tree = null): array
    {
        $query = DB::table('change')
            ->leftJoin('user', 'user.user_id', '=', 'change.user_id')
            ->where('change.status', '=', 'accepted')
            ->select([
                'change.user_id',
                DB::raw("COALESCE(real_name, user_name, '<unknown>') as display_name")
            ])
            ->distinct();

        if ($tree !== null) {
            $query->where('change.gedcom_id', '=', $tree->id());
        }

        $results = $query->orderBy('display_name')->get();

        $users = [];
        foreach ($results as $row) {
            $userId = (int) $row->user_id;
            $displayName = mb_convert_encoding($row->display_name, 'UTF-8', 'UTF-8');
            $users[$userId] = $displayName;
        }

        return $users;
    }

    /**
     * Process a single change record for data content stats
     *
     * @param object $change Change record from DB
     * @param array &$stats Accumulated statistics (passed by reference)
     */
    private function processChangeForDataContent(object $change, array &$stats): void
    {
        $hasNewGedcom = $change->new_gedcom !== '';
        $hasOldGedcom = $change->old_gedcom !== '';

        if (!$hasNewGedcom) {
            return;
        }

        // Record type statistics
        $recordType = $this->getRecordType($change->xref, $change->new_gedcom);
        $stats['recordTypeStats'][$recordType]++;
        $isIndividual = ($recordType === 'Individual');

        // Individual edit counts
        if ($isIndividual) {
            $stats['individualEditCounts'][$change->xref] = ($stats['individualEditCounts'][$change->xref] ?? 0) + 1;
        }

        // Fact-based statistics
        if ($hasOldGedcom && $hasNewGedcom) {
            $editedFacts = $this->extractEditedFacts($change->old_gedcom, $change->new_gedcom);
            foreach ($editedFacts as $fact) {
                $stats['editedFactCounts'][$fact] = ($stats['editedFactCounts'][$fact] ?? 0) + 1;
                if ($isIndividual) {
                    $key = $change->xref . '::' . $fact;
                    $stats['factChangesPerIndividual'][$key] = ($stats['factChangesPerIndividual'][$key] ?? 0) + 1;
                }
            }
        }

        if ($hasNewGedcom) {
            $addedFacts = $this->extractAddedFacts($change->old_gedcom, $change->new_gedcom);
            foreach ($addedFacts as $fact) {
                $stats['addedFactCounts'][$fact] = ($stats['addedFactCounts'][$fact] ?? 0) + 1;
            }
        }

        if ($hasOldGedcom) {
            $deletedFacts = $this->extractDeletedFacts($change->old_gedcom, $change->new_gedcom);
            foreach ($deletedFacts as $fact) {
                $stats['deletedFactCounts'][$fact] = ($stats['deletedFactCounts'][$fact] ?? 0) + 1;
            }
        }

        // Largest changes - use Myers Diff
        $this->processLargestChange($change, $hasOldGedcom, $stats['largestChangesData']);
    }

    /**
     * Calculate change score using Myers Diff and add to largest changes
     *
     * @param object $change Change record
     * @param bool $hasOldGedcom Whether old gedcom exists
     * @param array &$largestChangesData Accumulated data (passed by reference)
     */
    private function processLargestChange(object $change, bool $hasOldGedcom, array &$largestChangesData): void
    {
        $old_clean = $hasOldGedcom ? $this->stripMetadataNoise($change->old_gedcom) : '';
        $new_clean = $this->stripMetadataNoise($change->new_gedcom);

        $old_lines = $old_clean === '' ? [] : explode("\n", $old_clean);
        $new_lines = explode("\n", $new_clean);

        $myersDiff = new MyersDiff();
        $differences = $myersDiff->calculate($old_lines, $new_lines);

        $change_score = 0;
        foreach ($differences as $diff) {
            if ($diff[1] === MyersDiff::INSERT || $diff[1] === MyersDiff::DELETE) {
                $change_score++;
            }
        }

        if ($change_score > 0) {
            $largestChangesData[] = [
                'xref' => $change->xref,
                'change_time' => $change->change_time,
                'real_name' => $change->real_name,
                'line_diff' => $change_score
            ];
        }
    }

    /**
     * Batch load individual names from database
     *
     * @param Tree $tree
     * @param array $xrefs Individual XREFs to load
     * @return array<string,string> XREF => Name
     */
    private function batchLoadIndividualNames(Tree $tree, array $xrefs): array
    {
        if (empty($xrefs)) {
            return [];
        }

        $names = [];
        $individuals = DB::table('individuals')
            ->where('i_file', '=', $tree->id())
            ->whereIn('i_id', $xrefs)
            ->select(['i_id', 'i_gedcom'])
            ->get();

        foreach ($individuals as $indi) {
            $names[$indi->i_id] = $this->extractName($indi->i_gedcom);
        }

        return $names;
    }

    /**
     * Format largest changes data with record names
     *
     * @param Tree $tree
     * @param array $largestChangesData Raw data
     * @return array Formatted labels => line_diff
     */
    private function formatLargestChanges(Tree $tree, array $largestChangesData): array
    {
        usort($largestChangesData, fn($a, $b) => $b['line_diff'] <=> $a['line_diff']);
        $largestChangesData = array_slice($largestChangesData, 0, 15);

        // Collect xrefs by type for batch loading
        $individualXrefs = [];
        $otherXrefs = [];
        foreach ($largestChangesData as $item) {
            if (str_starts_with($item['xref'], 'I')) {
                $individualXrefs[] = $item['xref'];
            } else {
                $otherXrefs[] = $item['xref'];
            }
        }

        // Batch load names
        $recordNames = $this->batchLoadIndividualNames($tree, $individualXrefs);

        // Load other record types individually (rare case)
        foreach ($otherXrefs as $xref) {
            $record = Registry::gedcomRecordFactory()->make($xref, $tree);
            if ($record) {
                $recordNames[$xref] = strip_tags($record->fullName());
            }
        }

        // Format results
        $result = [];
        foreach ($largestChangesData as $item) {
            $recordName = '';
            if (isset($recordNames[$item['xref']])) {
                $fullName = mb_convert_encoding($recordNames[$item['xref']], 'UTF-8', 'UTF-8');
                $recordName = mb_strlen($fullName) > 30 ? mb_substr($fullName, 0, 27) . '...' : $fullName;
            }

            $label = $recordName !== ''
                ? $recordName . ' (' . $item['xref'] . ') - ' . date('Y-m-d H:i', strtotime($item['change_time']))
                : $item['xref'] . ' - ' . date('Y-m-d H:i', strtotime($item['change_time']));

            $userName = mb_convert_encoding($item['real_name'], 'UTF-8', 'UTF-8');
            if (mb_strlen($label) < 50) {
                $label .= ' (' . $userName . ')';
            }

            $result[$label] = $item['line_diff'];
        }

        return $result;
    }

    /**
     * Get data for "Data Content Statistics" tab (first tab)
     * These stats respect the time period filter
     *
     * @param Tree $tree
     * @param int|null $days Number of days to analyze (null = not using this mode)
     * @param array<int> $years Array of years to include (empty = not using this mode)
     * @param array<int> $userIds Filter by user IDs (empty = all users)
     *
     * @return array Chart data for first tab
     */
    public function getDataContentStats(Tree $tree, ?int $days = null, array $years = [], array $userIds = []): array
    {
        // Query changes
        $query = DB::table('change')
            ->leftJoin('user', 'user.user_id', '=', 'change.user_id')
            ->where('change.gedcom_id', '=', $tree->id())
            ->where('change.status', '=', 'accepted')
            ->select([
                'change.xref',
                'change.change_time',
                'change.old_gedcom',
                'change.new_gedcom',
                'change.user_id',
                DB::raw("COALESCE(user_name, 'Unknown') as user_name"),
                DB::raw("COALESCE(real_name, user_name, '<unknown>') as real_name")
            ]);

        $query = $this->applyDateFilter($query, $days, $years);

        if (!empty($userIds)) {
            $query->whereIn('change.user_id', $userIds);
        }

        $allChanges = $query->get();

        // Initialize statistics
        $stats = [
            'recordTypeStats' => [
                'Individual' => 0, 'Family' => 0, 'Source' => 0, 'Repository' => 0,
                'Media object' => 0, 'Note' => 0, 'Location' => 0, 'Submitter' => 0, 'Other' => 0,
            ],
            'editedFactCounts' => [],
            'addedFactCounts' => [],
            'deletedFactCounts' => [],
            'largestChangesData' => [],
            'individualEditCounts' => [],
            'factChangesPerIndividual' => [],
        ];

        // Process all changes
        foreach ($allChanges as $change) {
            $this->processChangeForDataContent($change, $stats);
        }

        // Post-process: Most edited individuals
        arsort($stats['individualEditCounts']);
        $topIndividuals = array_slice($stats['individualEditCounts'], 0, 15, true);
        $individualNames = $this->batchLoadIndividualNames($tree, array_keys($topIndividuals));

        $mostEditedIndividuals = [];
        foreach ($topIndividuals as $xref => $count) {
            $name = $individualNames[$xref] ?? $xref;
            $mostEditedIndividuals[$name] = $count;
        }

        // Post-process: Fact statistics
        arsort($stats['editedFactCounts']);
        arsort($stats['addedFactCounts']);
        arsort($stats['deletedFactCounts']);

        // Post-process: Largest changes
        $largestChanges = $this->formatLargestChanges($tree, $stats['largestChangesData']);

        // Post-process: Most changed facts per individual
        arsort($stats['factChangesPerIndividual']);
        $topFactChanges = array_slice($stats['factChangesPerIndividual'], 0, 15, true);

        $xrefsForFacts = array_map(fn($key) => explode('::', $key)[0], array_keys($topFactChanges));
        $namesForFacts = $this->batchLoadIndividualNames($tree, array_unique($xrefsForFacts));

        $mostChangedFactsPerIndividual = [];
        foreach ($topFactChanges as $key => $count) {
            [$xref, $fact] = explode('::', $key);
            if (isset($namesForFacts[$xref])) {
                $label = $namesForFacts[$xref] . ' (' . $xref . ') - ' . $fact;
                $mostChangedFactsPerIndividual[$label] = $count;
            }
        }

        return [
            'recordTypeStats' => array_filter($stats['recordTypeStats']),
            'mostEditedIndividuals' => $mostEditedIndividuals,
            'mostEditedFacts' => array_slice($stats['editedFactCounts'], 0, 15, true),
            'mostAddedFacts' => array_slice($stats['addedFactCounts'], 0, 15, true),
            'mostDeletedFacts' => array_slice($stats['deletedFactCounts'], 0, 15, true),
            'mostChangedFactsPerIndividual' => $mostChangedFactsPerIndividual,
            'largestChanges' => $largestChanges,
        ];
    }

    /**
     * Get data for "Editor Work Patterns" tab (second tab)
     *
     * @param Tree $tree
     * @param int|null $days Number of days to analyze (null = not using this mode)
     * @param array<int> $years Array of years to include (empty = not using this mode)
     * @param array<int> $userIds Filter by user IDs (empty = all users)
     *
     * @return array Chart data for second tab
     */
    public function getEditorPatternsStats(Tree $tree, ?int $days = null, array $years = [], array $userIds = []): array
    {
        // Query: Get changes for editor patterns tab
        $query = DB::table('change')
            ->leftJoin('user', 'user.user_id', '=', 'change.user_id')
            ->where('change.gedcom_id', '=', $tree->id())
            ->where('change.status', '=', 'accepted')
            ->where('change.new_gedcom', '<>', '')
            ->select([
                'change.xref',
                'change.change_time',
                'change.user_id',
                DB::raw("COALESCE(user_name, 'Unknown') as user_name")
            ]);

        // Apply date filter (Last X days OR Selected years)
        $query = $this->applyDateFilter($query, $days, $years);

        if (!empty($userIds)) {
            $query->whereIn('change.user_id', $userIds);
        }

        $allChanges = $query->get();

        // Initialize result arrays for second tab only
        $userStats = [];
        $hourStats = [];
        $dayStats = [];
        $dayOfMonthStats = [];
        $monthStats = [];
        $yearStats = [];
        $workSessionsByDate = [];

        $dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Single pass through all changes - process for editor patterns
        foreach ($allChanges as $change) {
            $changeTime = strtotime($change->change_time);
            $year = date('Y', $changeTime);
            $month = date('m', $changeTime);
            $day = date('d', $changeTime);
            $hour = date('H', $changeTime);
            $dayOfWeek = $dayNames[(int)date('w', $changeTime)];
            $dateOnly = date('Y-m-d', $changeTime);

            // User statistics
            if (!isset($userStats[$change->user_name])) {
                $userStats[$change->user_name] = 0;
            }
            $userStats[$change->user_name]++;

            // Hour statistics (multi-year)
            if (!isset($hourStats[$year])) {
                $hourStats[$year] = [];
            }
            if (!isset($hourStats[$year][$hour])) {
                $hourStats[$year][$hour] = 0;
            }
            $hourStats[$year][$hour]++;

            // Day of week statistics (multi-year)
            if (!isset($dayStats[$year])) {
                $dayStats[$year] = [];
            }
            if (!isset($dayStats[$year][$dayOfWeek])) {
                $dayStats[$year][$dayOfWeek] = 0;
            }
            $dayStats[$year][$dayOfWeek]++;

            // Day of month statistics (multi-year)
            if (!isset($dayOfMonthStats[$year])) {
                $dayOfMonthStats[$year] = [];
            }
            if (!isset($dayOfMonthStats[$year][$day])) {
                $dayOfMonthStats[$year][$day] = 0;
            }
            $dayOfMonthStats[$year][$day]++;

            // Month statistics (multi-year)
            if (!isset($monthStats[$year])) {
                $monthStats[$year] = [];
            }
            if (!isset($monthStats[$year][$month])) {
                $monthStats[$year][$month] = 0;
            }
            $monthStats[$year][$month]++;

            // Year statistics
            if (!isset($yearStats[$year])) {
                $yearStats[$year] = 0;
            }
            $yearStats[$year]++;

            // Work sessions by date
            if (!isset($workSessionsByDate[$dateOnly])) {
                $workSessionsByDate[$dateOnly] = [
                    'count' => 0,
                    'users' => []
                ];
            }
            $workSessionsByDate[$dateOnly]['count']++;
            $workSessionsByDate[$dateOnly]['users'][$change->user_id] = true;
        }

        // Post-process: Sort and limit results

        // User stats - sort by count
        arsort($userStats);

        // Biggest work sessions
        uasort($workSessionsByDate, function($a, $b) {
            return $b['count'] <=> $a['count'];
        });
        $workSessionsByDate = array_slice($workSessionsByDate, 0, 10, true);
        $biggestWorkSessions = [];
        foreach ($workSessionsByDate as $date => $data) {
            $userCount = count($data['users']);
            $userText = $userCount === 1 ? '1 user' : $userCount . ' users';
            $biggestWorkSessions[$date] = [
                'date' => $date,
                'count' => $data['count'],
                'users' => $userText
            ];
        }

        return [
            'userStats' => $userStats,
            'hourStats' => $hourStats,
            'dayStats' => $dayStats,
            'dayOfMonthStats' => $dayOfMonthStats,
            'monthStats' => $monthStats,
            'yearStats' => $yearStats,
            'biggestWorkSessions' => $biggestWorkSessions,
        ];
    }

    /**
     * Get distribution of changes per commit (histogram data)
     * A commit is defined as changes with the same user_id and change_time
     *
     * @param Tree|null $tree Specific tree or all trees
     * @param int $days Number of days to analyze (0 = all time)
     * @param array<int> $userIds Filter by user IDs (empty = all users)
     *
     * @return array{bins: array<string>, counts: array<int>, stats: array{mean: float, median: float, mode: int, total_commits: int, total_changes: int}}
     */
    public function getCommitSizeDistribution(?Tree $tree = null, ?int $days = null, array $years = [], array $userIds = []): array
    {
        $query = DB::table('change')
            ->select([
                'user_id',
                'change_time',
                DB::raw('COUNT(*) as changes_count')
            ])
            ->where('status', '=', 'accepted')
            ->groupBy('user_id', 'change_time');

        if ($tree !== null) {
            $query->where('gedcom_id', '=', $tree->id());
        }

        // Apply date filter (Last X days OR Selected years)
        $query = $this->applyDateFilter($query, $days, $years, 'change_time');

        if (!empty($userIds)) {
            $query->whereIn('user_id', $userIds);
        }

        $commits = $query->get();

        // Group into histogram bins
        $histogram = [];
        $allSizes = [];

        foreach ($commits as $commit) {
            $size = (int) $commit->changes_count;
            $allSizes[] = $size;

            // Create bins: 1, 2, 3, 4, 5, 6-10, 11-20, 21-50, 51+
            if ($size <= 5) {
                $bin = (string) $size;
            } elseif ($size <= 10) {
                $bin = '6-10';
            } elseif ($size <= 20) {
                $bin = '11-20';
            } elseif ($size <= 50) {
                $bin = '21-50';
            } else {
                $bin = '51+';
            }

            if (!isset($histogram[$bin])) {
                $histogram[$bin] = 0;
            }
            $histogram[$bin]++;
        }

        // Define bin order
        $binOrder = ['1', '2', '3', '4', '5', '6-10', '11-20', '21-50', '51+'];

        $bins = [];
        $counts = [];
        foreach ($binOrder as $bin) {
            $bins[] = $bin;
            $counts[] = $histogram[$bin] ?? 0;
        }

        // Calculate statistics
        $totalCommits = count($allSizes);
        $totalChanges = array_sum($allSizes);
        $mean = $totalCommits > 0 ? $totalChanges / $totalCommits : 0;

        // Median
        sort($allSizes);
        $median = 0;
        if ($totalCommits > 0) {
            $mid = (int) floor($totalCommits / 2);
            $median = $totalCommits % 2 === 0
                ? ($allSizes[$mid - 1] + $allSizes[$mid]) / 2
                : $allSizes[$mid];
        }

        // Mode (most common value)
        $valueCounts = array_count_values($allSizes);
        arsort($valueCounts);
        $mode = $totalCommits > 0 ? (int) array_key_first($valueCounts) : 0;

        return [
            'bins' => $bins,
            'counts' => $counts,
            'stats' => [
                'mean' => round($mean, 1),
                'median' => $median,
                'mode' => $mode,
                'total_commits' => $totalCommits,
                'total_changes' => $totalChanges,
            ],
        ];
    }

    /**
     * Get statistics about change status (accepted, rejected, pending)
     *
     * @param Tree|null $tree Specific tree or all trees
     * @param int $days Number of days to analyze (0 = all time)
     * @param array<int> $userIds Filter by user IDs (empty = all users)
     *
     * @return array<string,int> Status => count
     */
    public function getChangeStatusStats(?Tree $tree = null, ?int $days = null, array $years = [], array $userIds = []): array
    {
        $query = DB::table('change')
            ->select(['status', DB::raw('COUNT(*) as count')])
            ->groupBy('status');

        if ($tree !== null) {
            $query->where('gedcom_id', '=', $tree->id());
        }

        // Apply date filter (Last X days OR Selected years)
        $query = $this->applyDateFilter($query, $days, $years, 'change_time');

        if (!empty($userIds)) {
            $query->whereIn('user_id', $userIds);
        }

        $results = $query->get();

        $stats = [
            'accepted' => 0,
            'rejected' => 0,
            'pending' => 0,
        ];

        foreach ($results as $row) {
            if (isset($stats[$row->status])) {
                $stats[$row->status] = (int) $row->count;
            }
        }

        return $stats;
    }

    /**
     * Get heatmap data for custom pivot-like visualization
     *
     * @param Tree|null $tree
     * @param string $xDimension Dimension for X axis
     * @param string $yDimension Dimension for Y axis
     * @param string $measure What to measure
     * @param array<int> $userIds Filter by users
     * @param array<string> $recordXrefs Filter by specific records
     * @param int $days Filter by last N days (0 = no filter)
     * @param array<int> $years Filter by specific years
     *
     * @return array{data: array, xLabels: array, yLabels: array}
     */
    public function getHeatmapData(
        ?Tree $tree,
        string $xDimension,
        string $yDimension,
        string $measure,
        array $userIds = [],
        array $recordXrefs = [],
        int $days = 0,
        array $years = []
    ): array {
        $query = DB::table('change')
            ->where('status', '=', 'accepted');

        // Apply date filter
        $query = $this->applyDateFilter($query, $days, $years, 'change_time');

        if ($tree !== null) {
            $query->where('gedcom_id', '=', $tree->id());
        }

        if (!empty($userIds)) {
            $query->whereIn('user_id', $userIds);
        }

        if (!empty($recordXrefs)) {
            $query->whereIn('xref', $recordXrefs);
        }

        // Get dimension columns
        $xCol = $this->getDimensionColumn($xDimension);
        $yCol = $this->getDimensionColumn($yDimension);

        // Get measure column
        $measureCol = match($measure) {
            'uniqueRecords' => 'COUNT(DISTINCT xref)',
            'uniqueUsers' => 'COUNT(DISTINCT user_id)',
            'uniqueDays' => 'COUNT(DISTINCT DATE(change_time))',
            default => 'COUNT(*)', // 'changes'
        };

        // For record type, we need to join and parse
        if ($xDimension === 'recordType' || $yDimension === 'recordType') {
            $query->addSelect('new_gedcom', 'xref');
        }

        $results = $query
            ->select([
                DB::raw("$xCol as x_val"),
                DB::raw("$yCol as y_val"),
                DB::raw("$measureCol as value")
            ])
            ->groupBy('x_val', 'y_val')
            ->get();

        // Build matrix data
        $matrix = [];
        $xLabels = [];
        $yLabels = [];

        foreach ($results as $row) {
            $x = $this->formatDimensionValue($xDimension, $row->x_val);
            $y = $this->formatDimensionValue($yDimension, $row->y_val);

            if (!in_array($x, $xLabels)) {
                $xLabels[] = $x;
            }
            if (!in_array($y, $yLabels)) {
                $yLabels[] = $y;
            }

            $matrix[] = [
                'x' => $x,
                'y' => $y,
                'v' => (int) $row->value
            ];
        }

        // Sort labels
        $xLabels = $this->sortDimensionLabels($xDimension, $xLabels);
        $yLabels = $this->sortDimensionLabels($yDimension, $yLabels);

        return [
            'data' => $matrix,
            'xLabels' => $xLabels,
            'yLabels' => $yLabels,
        ];
    }

    /**
     * Get SQL column expression for a dimension
     */
    private function getDimensionColumn(string $dimension): string
    {
        return match($dimension) {
            'hour' => 'HOUR(change_time)',
            'dayOfWeek' => 'DAYOFWEEK(change_time)',
            'dayOfMonth' => 'DAY(change_time)',
            'month' => 'MONTH(change_time)',
            'year' => 'YEAR(change_time)',
            'user' => 'user_id',
            'recordType' => "SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(new_gedcom, '\\n', 1), ' ', 3), ' ', -1)",
            default => 'NULL',
        };
    }

    /**
     * Format dimension value for display
     */
    private function formatDimensionValue(string $dimension, $value): string
    {
        if ($value === null) {
            return 'N/A';
        }

        return match($dimension) {
            'hour' => str_pad((string) $value, 2, '0', STR_PAD_LEFT) . ':00',
            'dayOfWeek' => $this->getDayName((int) $value),
            'month' => $this->getMonthName((int) $value),
            'user' => $this->getUserName((int) $value),
            'recordType' => I18N::translate($this->mapGedcomTypeToLabel((string) $value)),
            default => (string) $value,
        };
    }

    /**
     * Sort dimension labels appropriately
     */
    private function sortDimensionLabels(string $dimension, array $labels): array
    {
        switch ($dimension) {
            case 'hour':
            case 'dayOfMonth':
            case 'year':
                sort($labels, SORT_NATURAL);
                break;
            case 'dayOfWeek':
                // Use translated day names in Monday-first order
                $order = [
                    I18N::translate('Mon'),
                    I18N::translate('Tue'),
                    I18N::translate('Wed'),
                    I18N::translate('Thu'),
                    I18N::translate('Fri'),
                    I18N::translate('Sat'),
                    I18N::translate('Sun'),
                ];
                usort($labels, fn($a, $b) => array_search($a, $order) <=> array_search($b, $order));
                break;
            case 'month':
                // Use translated month abbreviations
                $order = [
                    I18N::translateContext('Abbreviation for January', 'Jan'),
                    I18N::translateContext('Abbreviation for February', 'Feb'),
                    I18N::translateContext('Abbreviation for March', 'Mar'),
                    I18N::translateContext('Abbreviation for April', 'Apr'),
                    I18N::translateContext('Abbreviation for May', 'May'),
                    I18N::translateContext('Abbreviation for June', 'Jun'),
                    I18N::translateContext('Abbreviation for July', 'Jul'),
                    I18N::translateContext('Abbreviation for August', 'Aug'),
                    I18N::translateContext('Abbreviation for September', 'Sep'),
                    I18N::translateContext('Abbreviation for October', 'Oct'),
                    I18N::translateContext('Abbreviation for November', 'Nov'),
                    I18N::translateContext('Abbreviation for December', 'Dec'),
                ];
                usort($labels, fn($a, $b) => array_search($a, $order) <=> array_search($b, $order));
                break;
            case 'recordType':
                // Use translated record type labels
                $order = [
                    I18N::translate('Individual'),
                    I18N::translate('Family'),
                    I18N::translate('Source'),
                    I18N::translate('Repository'),
                    I18N::translate('Media object'),
                    I18N::translate('Note'),
                    I18N::translate('Location'),
                    I18N::translate('Submitter'),
                    I18N::translate('Submission'),
                    I18N::translate('Header'),
                    I18N::translate('Other'),
                ];
                usort($labels, function($a, $b) use ($order) {
                    $posA = array_search($a, $order);
                    $posB = array_search($b, $order);
                    if ($posA === false && $posB === false) return strcmp($a, $b);
                    if ($posA === false) return 1;
                    if ($posB === false) return -1;
                    return $posA <=> $posB;
                });
                break;
            default:
                sort($labels);
        }
        return $labels;
    }

    /**
     * Get day name from MySQL DAYOFWEEK (1=Sunday, 7=Saturday)
     */
    private function getDayName(int $dow): string
    {
        $days = [
            1 => I18N::translate('Sun'),
            2 => I18N::translate('Mon'),
            3 => I18N::translate('Tue'),
            4 => I18N::translate('Wed'),
            5 => I18N::translate('Thu'),
            6 => I18N::translate('Fri'),
            7 => I18N::translate('Sat'),
        ];
        return $days[$dow] ?? 'N/A';
    }

    /**
     * Get month name from number
     */
    private function getMonthName(int $month): string
    {
        $months = [
            1  => I18N::translateContext('Abbreviation for January', 'Jan'),
            2  => I18N::translateContext('Abbreviation for February', 'Feb'),
            3  => I18N::translateContext('Abbreviation for March', 'Mar'),
            4  => I18N::translateContext('Abbreviation for April', 'Apr'),
            5  => I18N::translateContext('Abbreviation for May', 'May'),
            6  => I18N::translateContext('Abbreviation for June', 'Jun'),
            7  => I18N::translateContext('Abbreviation for July', 'Jul'),
            8  => I18N::translateContext('Abbreviation for August', 'Aug'),
            9  => I18N::translateContext('Abbreviation for September', 'Sep'),
            10 => I18N::translateContext('Abbreviation for October', 'Oct'),
            11 => I18N::translateContext('Abbreviation for November', 'Nov'),
            12 => I18N::translateContext('Abbreviation for December', 'Dec'),
        ];
        return $months[$month] ?? 'N/A';
    }

    /**
     * Get username by ID
     */
    private function getUserName(int $userId): string
    {
        $user = DB::table('user')
            ->where('user_id', '=', $userId)
            ->select('real_name')
            ->first();

        return $user->real_name ?? "User #$userId";
    }

    /**
     * Search records for Select2 autocomplete
     *
     * @param Tree $tree
     * @param string $query Search term
     * @param string|null $type Filter by record type
     * @param int $limit Max results
     *
     * @return array<array{id: string, text: string}>
     */
    public function searchRecords(Tree $tree, string $query, ?string $type = null, int $limit = 20): array
    {
        // Sanitize search query - escape special SQL characters
        $searchTerm = '%' . addcslashes($query, '%_\\') . '%';

        // Get records that have changes
        $subquery = DB::table('change')
            ->where('gedcom_id', '=', $tree->id())
            ->where('status', '=', 'accepted')
            ->select('xref')
            ->distinct();

        // Search in individuals
        $results = [];

        if ($type === null || $type === 'INDI') {
            $individuals = DB::table('individuals')
                ->where('i_file', '=', $tree->id())
                ->whereIn('i_id', $subquery)
                ->where(function ($q) use ($searchTerm) {
                    // Use parameter binding to prevent SQL injection
                    $q->where('i_id', 'LIKE', $searchTerm)
                      ->orWhere('i_gedcom', 'LIKE', $searchTerm);
                })
                ->select('i_id', 'i_gedcom')
                ->limit($limit)
                ->get();

            foreach ($individuals as $indi) {
                $name = $this->extractName($indi->i_gedcom);
                $results[] = [
                    'id' => $indi->i_id,
                    'text' => "$name ({$indi->i_id})",
                    'type' => 'INDI'
                ];
            }
        }

        if ($type === null || $type === 'FAM') {
            $families = DB::table('families')
                ->where('f_file', '=', $tree->id())
                ->whereIn('f_id', $subquery)
                ->where('f_id', 'LIKE', $searchTerm)
                ->select('f_id')
                ->limit($limit)
                ->get();

            foreach ($families as $fam) {
                $results[] = [
                    'id' => $fam->f_id,
                    'text' => "Family {$fam->f_id}",
                    'type' => 'FAM'
                ];
            }
        }

        return array_slice($results, 0, $limit);
    }

    /**
     * Extract name from GEDCOM
     */
    private function extractName(string $gedcom): string
    {
        if (preg_match('/1 NAME (.+)/', $gedcom, $match)) {
            $name = trim(str_replace('/', '', $match[1]));
            // Ensure valid UTF-8 encoding
            $name = mb_convert_encoding($name, 'UTF-8', 'UTF-8');
            return $name;
        }
        return 'Unknown';
    }

    /**
     * Get fact completeness progress - shows if data is getting richer over time
     * For Tab: Data Quality
     *
     * @param Tree $tree
     * @param string $period 'month' or 'year'
     * @param int|null $days Number of days to analyze (null = not using this mode)
     * @param array<int> $years Array of years to include (empty = not using this mode)
     * @param array<int> $userIds Filter by user IDs (empty = all users)
     * @return array
     */
    public function getFactCompletenessProgress(Tree $tree, string $period = 'month', ?int $days = null, array $years = [], array $userIds = []): array
    {
        $dateFormat = $period === 'year' ? '%Y' : '%Y-%m';

        $query = DB::table('change')
            ->where('change.gedcom_id', '=', $tree->id())
            ->where('change.status', '=', 'accepted')
            ->where('change.old_gedcom', '<>', '')  // Only modifications, not creations
            ->where('change.new_gedcom', '<>', '');  // Not deletions

        // Apply date filter (Last X days OR Selected years)
        $query = $this->applyDateFilter($query, $days, $years);

        if (!empty($userIds)) {
            $query->whereIn('user_id', $userIds);
        }

        $query = $query->select([
                DB::raw("DATE_FORMAT(change_time, '{$dateFormat}') as period"),
                'old_gedcom',
                'new_gedcom'
            ])
            ->orderBy('period')
            ->get();

        // Calculate average fact count per period
        $stats = [];
        foreach ($query as $row) {
            $period_key = $row->period;
            if (!isset($stats[$period_key])) {
                $stats[$period_key] = [
                    'before' => [],
                    'after' => []
                ];
            }

            $stats[$period_key]['before'][] = $this->calculateFactCount($row->old_gedcom);
            $stats[$period_key]['after'][] = $this->calculateFactCount($row->new_gedcom);
        }

        // Calculate averages
        $result = [];
        foreach ($stats as $period_key => $data) {
            $before_avg = count($data['before']) > 0 ? array_sum($data['before']) / count($data['before']) : 0;
            $after_avg = count($data['after']) > 0 ? array_sum($data['after']) / count($data['after']) : 0;

            $result[$period_key] = [
                'before_avg' => round($before_avg, 2),
                'after_avg' => round($after_avg, 2),
                'net_gain' => round($after_avg - $before_avg, 2)
            ];
        }

        return $result;
    }

    /**
     * Get creation vs modification trend
     * For Tab: Data Quality
     *
     * @param Tree $tree
     * @param string $period 'month' or 'year'
     * @return array
     */
    public function getCreationVsModificationTrend(Tree $tree, string $period = 'month', ?int $days = null, array $years = [], array $userIds = []): array
    {
        $dateFormat = $period === 'year' ? '%Y' : '%Y-%m';

        $query = DB::table('change')
            ->where('change.gedcom_id', '=', $tree->id())
            ->where('change.status', '=', 'accepted')
            ->where('change.new_gedcom', '<>', '');  // Exclude deletions

        // Apply date filter (Last X days OR Selected years)
        $query = $this->applyDateFilter($query, $days, $years);

        if (!empty($userIds)) {
            $query->whereIn('user_id', $userIds);
        }

        $query = $query->select([
                DB::raw("DATE_FORMAT(change_time, '{$dateFormat}') as period"),
                DB::raw("SUM(CASE WHEN old_gedcom = '' THEN 1 ELSE 0 END) as creations"),
                DB::raw("SUM(CASE WHEN old_gedcom <> '' THEN 1 ELSE 0 END) as modifications")
            ])
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $result = [];
        foreach ($query as $row) {
            $result[$row->period] = [
                'creations' => (int) $row->creations,
                'modifications' => (int) $row->modifications
            ];
        }

        return $result;
    }

    /**
     * Get edit velocity trend with moving average
     * For Tab: Edit Patterns
     *
     * @param Tree $tree
     * @param string $period 'week' or 'month'
     * @param int $periods Number of periods to show
     * @return array
     */
    public function getEditVelocityTrend(Tree $tree, string $period = 'week', ?int $days = null, array $years = [], array $userIds = []): array
    {
        if ($period === 'week') {
            $dateFormat = '%Y-W%u';
        } else {
            $dateFormat = '%Y-%m';
        }

        $query = DB::table('change')
            ->where('change.gedcom_id', '=', $tree->id())
            ->where('change.status', '=', 'accepted')
            ->where('change.new_gedcom', '<>', '');

        // Apply date filter (Last X days OR Selected years)
        $query = $this->applyDateFilter($query, $days, $years);

        if (!empty($userIds)) {
            $query->whereIn('user_id', $userIds);
        }

        $query = $query->select([
                DB::raw("DATE_FORMAT(change_time, '{$dateFormat}') as period"),
                DB::raw('COUNT(*) as count')
            ])
            ->groupBy('period')
            ->orderBy('period', 'ASC')
            ->get();

        $data = [];
        foreach ($query as $row) {
            $data[$row->period] = (int) $row->count;
        }

        // Calculate moving average (4-period window)
        $movingAvg = $this->calculateMovingAverage(array_values($data), 4);

        $result = [];
        $keys = array_keys($data);
        foreach ($keys as $index => $period) {
            $result[$period] = [
                'count' => $data[$period],
                'moving_avg' => $movingAvg[$index] ?? null
            ];
        }

        return $result;
    }

    /**
     * Get session duration distribution
     * For Tab: Edit Patterns
     *
     * @param Tree $tree
     * @param array<int> $userIds
     * @return array
     */
    public function getSessionDurationDistribution(Tree $tree, ?int $days = null, array $years = [], array $userIds = []): array
    {
        $query = DB::table('change')
            ->where('change.gedcom_id', '=', $tree->id())
            ->where('change.status', '=', 'accepted')
            ->select(['user_id', 'change_time'])
            ->orderBy('user_id')
            ->orderBy('change_time');

        // Apply date filter (Last X days OR Selected years)
        $query = $this->applyDateFilter($query, $days, $years);

        if (!empty($userIds)) {
            $query->whereIn('user_id', $userIds);
        }

        $changes = $query->get();

        // Group into sessions (gap > 30 minutes = new session)
        $sessions = $this->groupIntoSessions($changes->toArray(), 30);

        // Calculate duration bins
        $bins = [
            '0-15min' => 0,
            '15-30min' => 0,
            '30-60min' => 0,
            '1-2hr' => 0,
            '2hr+' => 0
        ];

        foreach ($sessions as $session) {
            $duration = $session['duration_minutes'];
            if ($duration <= 15) {
                $bins['0-15min']++;
            } elseif ($duration <= 30) {
                $bins['15-30min']++;
            } elseif ($duration <= 60) {
                $bins['30-60min']++;
            } elseif ($duration <= 120) {
                $bins['1-2hr']++;
            } else {
                $bins['2hr+']++;
            }
        }

        return $bins;
    }

    /**
     * Get user collaboration network
     * For Tab: Edit Patterns
     *
     * @param Tree $tree
     * @param int $minSharedRecords Minimum shared records to create edge
     * @return array
     */
    public function getUserCollaborationNetwork(Tree $tree, int $minSharedRecords = 3, ?int $days = null, array $years = [], array $userIds = []): array
    {
        // Get all user-record combinations
        $query = DB::table('change')
            ->leftJoin('user', 'user.user_id', '=', 'change.user_id')
            ->where('change.gedcom_id', '=', $tree->id())
            ->where('change.status', '=', 'accepted');

        // Apply date filter (Last X days OR Selected years)
        $query = $this->applyDateFilter($query, $days, $years);

        if (!empty($userIds)) {
            $query->whereIn('change.user_id', $userIds);
        }

        $query = $query->select([
                DB::raw("COALESCE(user_name, 'Unknown') as user_name"),
                'xref'
            ])
            ->distinct()
            ->get();

        // Build user-record map
        $userRecords = [];
        foreach ($query as $row) {
            if (!isset($userRecords[$row->user_name])) {
                $userRecords[$row->user_name] = [];
            }
            $userRecords[$row->user_name][] = $row->xref;
        }

        // Find shared records between users
        $edges = [];
        $users = array_keys($userRecords);
        for ($i = 0; $i < count($users); $i++) {
            for ($j = $i + 1; $j < count($users); $j++) {
                $user1 = $users[$i];
                $user2 = $users[$j];
                $shared = array_intersect($userRecords[$user1], $userRecords[$user2]);
                $count = count($shared);

                if ($count >= $minSharedRecords) {
                    $edges[] = [
                        'source' => $user1,
                        'target' => $user2,
                        'weight' => $count
                    ];
                }
            }
        }

        return [
            'nodes' => $users,
            'edges' => $edges
        ];
    }

    /**
     * Get authentication summary (logins + failed attempts)
     * From log table
     *
     * @param Tree $tree
     * @param string $period 'day', 'week', or 'month'
     * @param int $days Number of days to look back
     * @param array $userIds Optional user IDs to filter by
     * @return array
     */
    public function getAuthSummary(Tree $tree, string $period = 'day', ?int $days = null, array $years = [], array $userIds = []): array
    {
        $dateFormat = match($period) {
            'week' => '%Y-W%u',
            'month' => '%Y-%m',
            default => '%Y-%m-%d'
        };

        // Get successful logins
        $loginQuery = DB::table('log')
            ->where('log_type', '=', 'auth')
            ->where('log_message', 'LIKE', 'Login:%');

        // Apply date filter (days OR years)
        if ($days !== null && $days > 0) {
            $cutoffDate = date('Y-m-d H:i:s', strtotime("-{$days} days"));
            $loginQuery->where('log_time', '>=', $cutoffDate);
        } elseif (!empty($years)) {
            $loginQuery->where(function ($q) use ($years) {
                foreach ($years as $year) {
                    $q->orWhereBetween('log_time', [
                        "{$year}-01-01 00:00:00",
                        "{$year}-12-31 23:59:59"
                    ]);
                }
            });
        }

        if (!empty($userIds)) {
            $loginQuery->whereIn('user_id', $userIds);
        }

        $logins = $loginQuery
            ->select([
                DB::raw("DATE_FORMAT(log_time, '{$dateFormat}') as period"),
                DB::raw('COUNT(*) as count')
            ])
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        // Get failed login attempts
        $failedQuery = DB::table('log')
            ->where('log_type', '=', 'auth')
            ->where(function ($q) {
                // Support both old and new webtrees log formats
                $q->where('log_message', 'LIKE', 'Login failed%')
                  ->orWhere('log_message', 'LIKE', 'Failed login%');
            });

        // Apply date filter (days OR years)
        if ($days !== null && $days > 0) {
            $cutoffDate = date('Y-m-d H:i:s', strtotime("-{$days} days"));
            $failedQuery->where('log_time', '>=', $cutoffDate);
        } elseif (!empty($years)) {
            $failedQuery->where(function ($q) use ($years) {
                foreach ($years as $year) {
                    $q->orWhereBetween('log_time', [
                        "{$year}-01-01 00:00:00",
                        "{$year}-12-31 23:59:59"
                    ]);
                }
            });
        }

        if (!empty($userIds)) {
            // Support both specific user IDs and NULL (failed login attempts have NULL user_id)
            $failedQuery->where(function ($q) use ($userIds) {
                $q->whereIn('user_id', $userIds)
                  ->orWhereNull('user_id');
            });
        }

        $failed = $failedQuery
            ->select([
                DB::raw("DATE_FORMAT(log_time, '{$dateFormat}') as period"),
                DB::raw('COUNT(*) as count')
            ])
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        // Combine results
        $result = [];
        foreach ($logins as $row) {
            $result[$row->period] = [
                'logins' => (int) $row->count,
                'failed' => 0
            ];
        }

        foreach ($failed as $row) {
            if (!isset($result[$row->period])) {
                $result[$row->period] = ['logins' => 0, 'failed' => 0];
            }
            $result[$row->period]['failed'] = (int) $row->count;
        }

        ksort($result);
        return $result;
    }

    /**
     * Get search activity timeline
     * From log table
     *
     * @param Tree $tree
     * @param string $period 'day', 'week', or 'month'
     * @param int $days Number of days to look back
     * @param array $userIds Optional user IDs to filter by
     * @return array
     */
    public function getSearchTimeline(Tree $tree, string $period = 'day', ?int $days = null, array $years = [], array $userIds = []): array
    {
        $dateFormat = match($period) {
            'week' => '%Y-W%u',
            'month' => '%Y-%m',
            default => '%Y-%m-%d'
        };

        $query = DB::table('log')
            ->where('log_type', '=', 'search');
            // Note: No gedcom_id filter - search logs are global across all trees
            // and gedcom_id may vary historically as trees are added/removed

        // Apply date filter (days OR years)
        if ($days !== null && $days > 0) {
            $cutoffDate = date('Y-m-d H:i:s', strtotime("-{$days} days"));
            $query->where('log_time', '>=', $cutoffDate);
        } elseif (!empty($years)) {
            $query->where(function ($q) use ($years) {
                foreach ($years as $year) {
                    $q->orWhereBetween('log_time', [
                        "{$year}-01-01 00:00:00",
                        "{$year}-12-31 23:59:59"
                    ]);
                }
            });
        }

        if (!empty($userIds)) {
            // Support both specific user IDs and NULL (anonymous/system searches)
            $query->where(function ($q) use ($userIds) {
                $q->whereIn('user_id', $userIds)
                  ->orWhereNull('user_id');
            });
        }

        $query = $query
            ->select([
                DB::raw("DATE_FORMAT(log_time, '{$dateFormat}') as period"),
                DB::raw('COUNT(*) as count')
            ])
            ->groupBy('period')
            ->orderBy('period')
            ->get();

        $result = [];
        foreach ($query as $row) {
            $result[$row->period] = (int) $row->count;
        }

        return $result;
    }

    /**
     * Get search terms frequency
     * From log table
     *
     * @param Tree $tree
     * @param int $days Number of days to look back
     * @param int $limit Top N results
     * @param array $userIds Optional user IDs to filter by
     * @return array
     */
    public function getSearchTermsFrequency(Tree $tree, ?int $days = null, array $years = [], int $limit = 20, array $userIds = []): array
    {
        $query = DB::table('log')
            ->where('log_type', '=', 'search');
            // Note: No gedcom_id filter - search logs are global across all trees
            // and gedcom_id may vary historically as trees are added/removed

        // Apply date filter (days OR years)
        if ($days !== null && $days > 0) {
            $cutoffDate = date('Y-m-d H:i:s', strtotime("-{$days} days"));
            $query->where('log_time', '>=', $cutoffDate);
        } elseif (!empty($years)) {
            $query->where(function ($q) use ($years) {
                foreach ($years as $year) {
                    $q->orWhereBetween('log_time', [
                        "{$year}-01-01 00:00:00",
                        "{$year}-12-31 23:59:59"
                    ]);
                }
            });
        }

        if (!empty($userIds)) {
            // Support both specific user IDs and NULL (anonymous/system searches)
            $query->where(function ($q) use ($userIds) {
                $q->whereIn('user_id', $userIds)
                  ->orWhereNull('user_id');
            });
        }

        $query = $query
            ->select([
                'log_message',
                DB::raw('COUNT(*) as count')
            ])
            ->groupBy('log_message')
            ->orderByDesc('count')
            ->limit($limit)
            ->get();

        $result = [];
        foreach ($query as $row) {
            // Clean up search message (may have extra info)
            $term = $this->cleanSearchTerm($row->log_message);
            if ($term !== '') {
                $result[$term] = (int) $row->count;
            }
        }

        return $result;
    }

    /**
     * Get failed login attempts list
     * From log table
     *
     * @param Tree $tree
     * @param int $days Number of days to look back
     * @param int $minAttempts Minimum attempts to include
     * @param int $limit Top N results
     * @param array $userIds Optional user IDs to filter by
     * @return array
     */
    public function getFailedLoginsList(Tree $tree, ?int $days = null, array $years = [], int $minAttempts = 3, int $limit = 20, array $userIds = []): array
    {
        $query = DB::table('log')
            ->where('log_type', '=', 'auth')
            ->where(function ($q) {
                // Support both old and new webtrees log formats
                $q->where('log_message', 'LIKE', 'Login failed%')
                  ->orWhere('log_message', 'LIKE', 'Failed login%');
            });

        // Apply date filter (days OR years)
        if ($days !== null && $days > 0) {
            $cutoffDate = date('Y-m-d H:i:s', strtotime("-{$days} days"));
            $query->where('log_time', '>=', $cutoffDate);
        } elseif (!empty($years)) {
            $query->where(function ($q) use ($years) {
                foreach ($years as $year) {
                    $q->orWhereBetween('log_time', [
                        "{$year}-01-01 00:00:00",
                        "{$year}-12-31 23:59:59"
                    ]);
                }
            });
        }

        if (!empty($userIds)) {
            // Support both specific user IDs and NULL (failed login attempts have NULL user_id)
            $query->where(function ($q) use ($userIds) {
                $q->whereIn('user_id', $userIds)
                  ->orWhereNull('user_id');
            });
        }

        // Fetch all matching entries (don't group yet - we need to extract username first)
        $allEntries = $query
            ->select(['log_message', 'ip_address', 'log_time'])
            ->orderByDesc('log_time')
            ->get();

        // Group by extracted username + IP address in PHP
        $grouped = [];
        foreach ($allEntries as $entry) {
            $username = $this->extractFailedLoginUser($entry->log_message);
            $key = $username . '|' . $entry->ip_address;

            if (!isset($grouped[$key])) {
                $grouped[$key] = [
                    'username' => $username,
                    'ip_address' => $entry->ip_address,
                    'attempts' => 0,
                    'last_attempt' => $entry->log_time
                ];
            }

            $grouped[$key]['attempts']++;

            // Keep the most recent timestamp
            if ($entry->log_time > $grouped[$key]['last_attempt']) {
                $grouped[$key]['last_attempt'] = $entry->log_time;
            }
        }

        // Filter by minAttempts and sort
        $result = array_filter($grouped, function($item) use ($minAttempts) {
            return $item['attempts'] >= $minAttempts;
        });

        usort($result, function($a, $b) {
            return $b['attempts'] <=> $a['attempts'];
        });

        // Apply limit
        $result = array_slice($result, 0, $limit);

        return $result;
    }

    /**
     * Helper: Clean search term from log message
     *
     * @param string $message
     * @return string
     */
    private function cleanSearchTerm(string $message): string
    {
        // Search messages vary by webtrees version
        // Try to extract the actual search term

        // Remove common prefixes
        $term = preg_replace('/^Search:\s*/i', '', $message);
        $term = preg_replace('/^Searched for:\s*/i', '', $term);

        // Limit length
        if (strlen($term) > 100) {
            $term = substr($term, 0, 97) . '...';
        }

        return trim($term);
    }

    /**
     * Helper: Extract username from failed login message
     *
     * @param string $message
     * @return string
     */
    private function extractFailedLoginUser(string $message): string
    {
        // New format: "Login failed (reason): username"
        if (preg_match('/Login failed\s*\([^)]+\):\s*(.+)/', $message, $matches)) {
            return trim($matches[1]);
        }

        // Old format: "Failed login: username from ip"
        if (preg_match('/Failed login:\s*(.+?)\s+from\s+/', $message, $matches)) {
            return trim($matches[1]);
        }

        // Very old format: "Login failed ->username<- reason"
        if (preg_match('/Login failed\s*->(.+?)<-/', $message, $matches)) {
            return trim($matches[1]);
        }

        // Fallback: return the whole message after first colon
        if (strpos($message, ':') !== false) {
            return trim(substr($message, strpos($message, ':') + 1));
        }

        return trim($message);
    }

    /**
     * Helper: Calculate number of facts in GEDCOM
     *
     * @param string $gedcom
     * @return int
     */
    private function calculateFactCount(string $gedcom): int
    {
        if (empty($gedcom)) {
            return 0;
        }

        // Count lines starting with "1 " (level 1 facts)
        $lines = explode("\n", $gedcom);
        $count = 0;
        foreach ($lines as $line) {
            if (preg_match('/^1 [A-Z]/', $line)) {
                $count++;
            }
        }

        return $count;
    }

    /**
     * Helper: Calculate moving average
     *
     * @param array<float> $data
     * @param int $window
     * @return array<float>
     */
    private function calculateMovingAverage(array $data, int $window): array
    {
        $result = [];
        $count = count($data);

        for ($i = 0; $i < $count; $i++) {
            $start = max(0, $i - $window + 1);
            $slice = array_slice($data, $start, $window);
            $result[$i] = count($slice) > 0 ? array_sum($slice) / count($slice) : 0;
        }

        return $result;
    }

    /**
     * Helper: Group changes into sessions
     *
     * @param array $changes
     * @param int $gapMinutes
     * @return array
     */
    private function groupIntoSessions(array $changes, int $gapMinutes): array
    {
        $sessions = [];
        $currentSession = null;

        foreach ($changes as $change) {
            $time = strtotime($change->change_time);

            if ($currentSession === null || $time - $currentSession['last_time'] > $gapMinutes * 60) {
                // Start new session
                if ($currentSession !== null) {
                    $currentSession['duration_minutes'] = ($currentSession['last_time'] - $currentSession['start_time']) / 60;
                    $sessions[] = $currentSession;
                }

                $currentSession = [
                    'user_id' => $change->user_id,
                    'start_time' => $time,
                    'last_time' => $time,
                    'count' => 1
                ];
            } else {
                // Continue current session
                $currentSession['last_time'] = $time;
                $currentSession['count']++;
            }
        }

        // Add last session
        if ($currentSession !== null) {
            $currentSession['duration_minutes'] = ($currentSession['last_time'] - $currentSession['start_time']) / 60;
            $sessions[] = $currentSession;
        }

        return $sessions;
    }

    /**
     * Strip metadata noise from GEDCOM before diff calculation
     *
     * Removes entire CHAN blocks which contain:
     * - 1 CHAN header
     * - 2 DATE (change date)
     * - 3 TIME (change time)
     * - 2 _WT_USER (user tracking)
     *
     * Must preserve all content including:
     * - 2 DATE under 1 BIRT/DEAT/MARR (actual dates)
     * - All other facts and data
     *
     * @param string $gedcom Full GEDCOM record
     * @return string GEDCOM with CHAN blocks removed
     */
    private function stripMetadataNoise(string $gedcom): string
    {
        $lines = explode("\n", $gedcom);
        $result = [];
        $inChanBlock = false;

        foreach ($lines as $line) {
            // Detect CHAN block start (level 1)
            if (preg_match('/^1\s+CHAN\s*$/', $line)) {
                $inChanBlock = true;
                continue;  // Skip CHAN header
            }

            // If in CHAN block, skip until we hit level 0 or 1 again
            if ($inChanBlock) {
                if (preg_match('/^[01]\s+/', $line)) {
                    $inChanBlock = false;
                    // Don't skip this line - it's the next record/fact
                } else {
                    continue;  // Skip sub-levels of CHAN (2 DATE, 3 TIME, 2 _WT_USER)
                }
            }

            $result[] = $line;
        }

        return implode("\n", $result);
    }

    /**
     * Get message timeline statistics (messages over time)
     *
     * @param Tree|null $tree Specific tree or all trees
     * @param string $groupBy Group by: 'day', 'week', 'month', 'year'
     * @param int|null $days Number of days to analyze (null = all time)
     * @param array<int> $years Array of years to include (empty = not using this mode)
     * @param array<int> $userIds Filter by user IDs (empty = all users)
     *
     * @return array{labels: array<string>, datasets: array}
     */
    public function getMessageTimeline(?Tree $tree, string $groupBy = 'day', ?int $days = null, array $years = [], array $userIds = []): array
    {
        $dateFormat = match($groupBy) {
            'week' => '%Y-W%u',
            'month' => '%Y-%m',
            default => '%Y-%m-%d'
        };

        $query = DB::table('message')
            ->select([DB::raw("DATE_FORMAT(created, '{$dateFormat}') as period"), DB::raw('COUNT(*) as count')])
            ->groupBy('period')
            ->orderBy('period');

        // Apply date filter
        $query = $this->applyDateFilter($query, $days, $years, 'created');

        // Apply user filter (messages TO these users)
        if (!empty($userIds)) {
            $query->whereIn('user_id', $userIds);
        }

        $results = $query->get();

        $labels = [];
        $data = [];

        foreach ($results as $row) {
            $labels[] = $row->period;
            $data[] = (int) $row->count;
        }

        return [
            'labels' => $labels,
            'datasets' => [
                [
                    'label' => I18N::translate('Messages'),
                    'data' => $data,
                    'borderColor' => 'rgb(75, 192, 192)',
                    'backgroundColor' => 'rgba(75, 192, 192, 0.2)',
                    'tension' => 0.1,
                ],
            ],
        ];
    }

    /**
     * Get user communication statistics (sent and received messages per user)
     *
     * @param Tree|null $tree Specific tree or all trees
     * @param int|null $days Number of days to analyze (null = all time)
     * @param array<int> $years Array of years to include (empty = not using this mode)
     * @param int $limit Top N users to return
     * @param array<int> $userIds Filter by user IDs (empty = all users)
     *
     * @return array{labels: array<string>, datasets: array}
     */
    public function getUserMessageStats(?Tree $tree, ?int $days = null, array $years = [], int $limit = 15, array $userIds = []): array
    {
        // Get received messages count per user - GROUP BY raw columns only
        $receivedQuery = DB::table('message')
            ->leftJoin('user', 'user.user_id', '=', 'message.user_id')
            ->select([
                'message.user_id',
                'user.real_name',
                'user.user_name',
                DB::raw('COUNT(*) as received_count'),
            ])
            ->groupBy('message.user_id', 'user.real_name', 'user.user_name');

        $receivedQuery = $this->applyDateFilter($receivedQuery, $days, $years, 'message.created');

        if (!empty($userIds)) {
            $receivedQuery->whereIn('message.user_id', $userIds);
        }

        $receivedResults = $receivedQuery->get();

        // Get sent messages count per sender email
        // Query ALL sent messages first, then match to users in PHP
        $sentQuery = DB::table('message')
            ->select([
                'message.sender',
                DB::raw('COUNT(*) as sent_count'),
            ])
            ->groupBy('message.sender');

        $sentQuery = $this->applyDateFilter($sentQuery, $days, $years, 'message.created');

        $sentResults = $sentQuery->get();

        // Build email-to-user mapping for ALL users in system
        // (needed to match sender emails to users)
        $allUsers = DB::table('user')
            ->select(['user_id', 'email', 'real_name', 'user_name'])
            ->get();

        $emailToUser = [];
        foreach ($allUsers as $user) {
            $emailToUser[$user->email] = $user;
        }

        // Merge results by user name (apply COALESCE logic in PHP)
        $userStats = [];

        // Process received messages
        foreach ($receivedResults as $row) {
            $userName = $row->real_name ?? $row->user_name ?? 'Unknown';
            if (!isset($userStats[$userName])) {
                $userStats[$userName] = ['received' => 0, 'sent' => 0];
            }
            $userStats[$userName]['received'] += (int) $row->received_count;
        }

        // Process sent messages - match sender email to user
        foreach ($sentResults as $row) {
            $senderEmail = $row->sender;

            // Try to find user by email
            if (isset($emailToUser[$senderEmail])) {
                $user = $emailToUser[$senderEmail];

                // If user filter is active, check if this user is in the filtered list
                if (!empty($userIds) && !in_array($user->user_id, $userIds)) {
                    continue; // Skip users not in filter
                }

                $userName = $user->real_name ?? $user->user_name ?? $senderEmail;
            } else {
                // Sender not in user table (external/deleted user)
                // If user filter is active, skip external senders
                if (!empty($userIds)) {
                    continue;
                }

                $userName = $senderEmail;
            }

            if (!isset($userStats[$userName])) {
                $userStats[$userName] = ['received' => 0, 'sent' => 0];
            }
            $userStats[$userName]['sent'] += (int) $row->sent_count;
        }

        // Sort by total activity (received + sent) and limit
        uasort($userStats, static function ($a, $b): int {
            return ($b['received'] + $b['sent']) <=> ($a['received'] + $a['sent']);
        });

        $userStats = array_slice($userStats, 0, $limit, true);

        // Prepare chart data
        $labels = array_keys($userStats);
        $receivedData = [];
        $sentData = [];

        foreach ($userStats as $stats) {
            $receivedData[] = $stats['received'];
            $sentData[] = $stats['sent'];
        }

        return [
            'labels' => $labels,
            'datasets' => [
                [
                    'label' => I18N::translate('Received'),
                    'data' => $receivedData,
                    'backgroundColor' => 'rgba(54, 162, 235, 0.8)',
                ],
                [
                    'label' => I18N::translate('Sent'),
                    'data' => $sentData,
                    'backgroundColor' => 'rgba(255, 99, 132, 0.8)',
                ],
            ],
        ];
    }

    /**
     * Search all record types for unified TomSelect autocomplete
     *
     * @param Tree $tree
     * @param string $query Search term
     * @param array<string>|null $types Filter to specific types (null = all)
     * @param int $limit Maximum results to return
     *
     * @return array<array{value: string, text: string, type: string, optgroup: string}>
     */
    public function searchAllRecordTypes(
        Tree $tree,
        string $query,
        ?array $types = null,
        int $limit = 50
    ): array {
        $results = [];
        $searchTerm = '%' . addcslashes($query, '%_\\') . '%';

        // Define record types with their optgroup labels
        $recordTypes = [
            'INDI' => I18N::translate('Individuals'),
            'FAM'  => I18N::translate('Families'),
            'SOUR' => I18N::translate('Sources'),
            'REPO' => I18N::translate('Repositories'),
            'OBJE' => I18N::translate('Media objects'),
            'NOTE' => I18N::translate('Shared notes'),
            'SUBM' => I18N::translate('Submitters'),
        ];

        // Filter types if specified
        if ($types !== null) {
            $recordTypes = array_intersect_key($recordTypes, array_flip($types));
        }

        // Calculate limit per type to ensure balanced results
        $limitPerType = (int) ceil($limit / count($recordTypes));

        foreach ($recordTypes as $type => $optgroupLabel) {
            $typeResults = $this->searchRecordsByType($tree, $type, $searchTerm, $limitPerType);
            foreach ($typeResults as $result) {
                $results[] = [
                    'value' => $result['xref'],
                    'text' => $result['text'],
                    'type' => $type,
                    'optgroup' => $optgroupLabel,
                ];
            }
        }

        // Sort by optgroup for better display, then limit
        usort($results, fn($a, $b) => strcmp($a['optgroup'], $b['optgroup']));

        return array_slice($results, 0, $limit);
    }

    /**
     * Search records of a specific type
     *
     * @param Tree $tree
     * @param string $type Record type (INDI, FAM, SOUR, etc.)
     * @param string $searchTerm SQL LIKE pattern
     * @param int $limit
     *
     * @return array<array{xref: string, text: string}>
     */
    private function searchRecordsByType(Tree $tree, string $type, string $searchTerm, int $limit): array
    {
        $results = [];

        switch ($type) {
            case 'INDI':
                $rows = DB::table('individuals')
                    ->join('name', function ($join) {
                        $join->on('name.n_file', '=', 'individuals.i_file')
                             ->on('name.n_id', '=', 'individuals.i_id');
                    })
                    ->where('i_file', '=', $tree->id())
                    ->where(function ($q) use ($searchTerm) {
                        $q->where('i_id', 'LIKE', $searchTerm)
                          ->orWhere('n_full', 'LIKE', $searchTerm);
                    })
                    ->select('i_id')
                    ->distinct()
                    ->limit($limit)
                    ->get();

                foreach ($rows as $row) {
                    $individual = Registry::individualFactory()->make($row->i_id, $tree);
                    if ($individual !== null && $individual->canShow()) {
                        $results[] = [
                            'xref' => $row->i_id,
                            'text' => strip_tags($individual->fullName()) . ' (' . strip_tags($individual->lifespan()) . ')',
                        ];
                    }
                }
                break;

            case 'FAM':
                $rows = DB::table('families')
                    ->where('f_file', '=', $tree->id())
                    ->where(function ($q) use ($searchTerm) {
                        $q->where('f_id', 'LIKE', $searchTerm)
                          ->orWhere('f_gedcom', 'LIKE', $searchTerm);
                    })
                    ->select('f_id')
                    ->limit($limit)
                    ->get();

                foreach ($rows as $row) {
                    $family = Registry::familyFactory()->make($row->f_id, $tree);
                    if ($family !== null && $family->canShow()) {
                        $results[] = [
                            'xref' => $row->f_id,
                            'text' => strip_tags($family->fullName()),
                        ];
                    }
                }
                break;

            case 'SOUR':
                $rows = DB::table('sources')
                    ->where('s_file', '=', $tree->id())
                    ->where(function ($q) use ($searchTerm) {
                        $q->where('s_id', 'LIKE', $searchTerm)
                          ->orWhere('s_name', 'LIKE', $searchTerm);
                    })
                    ->select('s_id', 's_name')
                    ->limit($limit)
                    ->get();

                foreach ($rows as $row) {
                    $source = Registry::sourceFactory()->make($row->s_id, $tree);
                    if ($source !== null && $source->canShow()) {
                        $results[] = [
                            'xref' => $row->s_id,
                            'text' => $row->s_name ?: $row->s_id,
                        ];
                    }
                }
                break;

            case 'OBJE':
                $rows = DB::table('media')
                    ->where('m_file', '=', $tree->id())
                    ->where(function ($q) use ($searchTerm) {
                        $q->where('m_id', 'LIKE', $searchTerm)
                          ->orWhere('m_gedcom', 'LIKE', $searchTerm);
                    })
                    ->select('m_id')
                    ->limit($limit)
                    ->get();

                foreach ($rows as $row) {
                    $media = Registry::mediaFactory()->make($row->m_id, $tree);
                    if ($media !== null && $media->canShow()) {
                        $results[] = [
                            'xref' => $row->m_id,
                            'text' => strip_tags($media->fullName()),
                        ];
                    }
                }
                break;

            case 'REPO':
            case 'NOTE':
            case 'SUBM':
                $rows = DB::table('other')
                    ->where('o_file', '=', $tree->id())
                    ->where('o_type', '=', $type)
                    ->where(function ($q) use ($searchTerm) {
                        $q->where('o_id', 'LIKE', $searchTerm)
                          ->orWhere('o_gedcom', 'LIKE', $searchTerm);
                    })
                    ->select('o_id', 'o_gedcom')
                    ->limit($limit)
                    ->get();

                foreach ($rows as $row) {
                    // TODO(human): Implement record visibility check and text extraction
                    $text = $this->extractRecordTitle($row->o_gedcom, $type);
                    $results[] = [
                        'xref' => $row->o_id,
                        'text' => $text ?: $row->o_id,
                    ];
                }
                break;
        }

        return $results;
    }

    /**
     * Extract title/name from GEDCOM record for REPO, NOTE, SUBM types
     *
     * @param string $gedcom Raw GEDCOM data
     * @param string $type Record type
     *
     * @return string Extracted title or empty string
     */
    private function extractRecordTitle(string $gedcom, string $type): string
    {
        switch ($type) {
            case 'REPO':
            case 'SUBM':
                // Extract NAME tag value
                if (preg_match('/1 NAME (.+)/m', $gedcom, $match)) {
                    return trim($match[1]);
                }
                break;

            case 'NOTE':
                // Note content is on the header line or continuation
                if (preg_match('/0 @[^@]+@ NOTE (.+)/m', $gedcom, $match)) {
                    $text = trim($match[1]);
                    // Truncate long notes
                    return strlen($text) > 60 ? substr($text, 0, 57) . '...' : $text;
                }
                // Check for CONC/CONT if header was empty
                if (preg_match('/1 CONT (.+)/m', $gedcom, $match)) {
                    $text = trim($match[1]);
                    return strlen($text) > 60 ? substr($text, 0, 57) . '...' : $text;
                }
                break;
        }

        return '';
    }
}
