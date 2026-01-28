<?php

/**
 * Insight Lens.
 */

declare(strict_types=1);

namespace WebtreesLens;

use Fisharebest\Localization\Translation;
use Fisharebest\Webtrees\Auth;
use Fisharebest\Webtrees\DB;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Module\AbstractModule;
use Fisharebest\Webtrees\Module\ModuleChartInterface;
use Fisharebest\Webtrees\Module\ModuleChartTrait;
use Fisharebest\Webtrees\Module\ModuleConfigInterface;
use Fisharebest\Webtrees\Module\ModuleConfigTrait;
use Fisharebest\Webtrees\Module\ModuleCustomInterface;
use Fisharebest\Webtrees\Module\ModuleCustomTrait;
use Fisharebest\Webtrees\Menu;
use Fisharebest\Webtrees\Tree;
use Fisharebest\Webtrees\Validator;
use Fisharebest\Webtrees\View;
use Fisharebest\Webtrees\Http\ViewResponseTrait;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use WebtreesLens\Services\LensStatsService;

/**
 * Class LensModule
 *
 * A custom webtrees module that displays change statistics and charts.
 *
 * Modules *must* implement ModuleCustomInterface.  They *may* also implement other interfaces.
 */
class LensModule extends AbstractModule implements ModuleCustomInterface, ModuleChartInterface, ModuleConfigInterface
{
    use ModuleCustomTrait;
    use ModuleChartTrait;
    use ModuleConfigTrait;
    use ViewResponseTrait;

    private LensStatsService $stats_service;

    /**
     * Constructor with dependency injection.
     *
     * @param LensStatsService $stats_service
     */
    public function __construct(LensStatsService $stats_service)
    {
        $this->stats_service = $stats_service;
    }

    /**
     * Bootstrap.  This function is called on *enabled* modules.
     * It is a good place to register routes and views.
     * Note that it is only called on genealogy pages - not on admin pages.
     *
     * @return void
     */
    public function boot(): void
    {
        View::registerNamespace($this->name(), $this->resourcesFolder() . 'views/');
    }

    /**
     * Where are our resources stored?
     *
     * @return string
     */
    public function resourcesFolder(): string
    {
        return __DIR__ . '/resources/';
    }

    /**
     * How should this module be identified in the control panel, etc.?
     *
     * @return string
     */
    public function title(): string
    {
        return I18N::translate('Insight Lens');
    }

    /**
     * A sentence describing what this module does.
     *
     * @return string
     */
    public function description(): string
    {
        return I18N::translate('Visualize genealogy change statistics with interactive charts');
    }

    /**
     * CSS class for the chart menu.
     *
     * @return string
     */
    public function chartMenuClass(): string
    {
        return 'menu-chart-statistics';
    }

    /**
     * The URL for this chart.
     *
     * @param Individual $individual
     * @param array<bool|int|string|array<string>|null> $parameters
     *
     * @return string
     */
    public function chartUrl(Individual $individual, array $parameters = []): string
    {
        return route('module', [
            'module' => $this->name(),
            'action' => 'Charts',
            'tree'   => $individual->tree()->name(),
        ] + $parameters);
    }

    /**
     * The title for this chart.
     *
     * @param Individual $individual
     *
     * @return string
     */
    public function chartTitle(Individual $individual): string
    {
        return I18N::translate('Change Statistics');
    }

    /**
     * Handle the Charts action - returns HTML view
     * AJAX data fetching now handled by getDataAction()
     *
     * @param ServerRequestInterface $request
     *
     * @return ResponseInterface
     */
    public function getChartsAction(ServerRequestInterface $request): ResponseInterface
    {
        $tree = Validator::attributes($request)->tree();
        $user = Validator::attributes($request)->user();

        // Check if authentication is required
        $require_authentication = (bool) $this->getPreference('REQUIRE_AUTHENTICATION', '0');
        if ($require_authentication && !Auth::check()) {
            throw new \Fisharebest\Webtrees\Http\Exceptions\HttpAccessDeniedException(
                I18N::translate('You must be logged in to view statistics')
            );
        }

        // Check component access
        Auth::checkComponentAccess($this, ModuleChartInterface::class, $tree, $user);

        // Get filter parameters for initial page load
        $default_days = (int) $this->getPreference('DEFAULT_DAYS', '30');
        $days = Validator::queryParams($request)->integer('days', $default_days);
        $userIds = Validator::queryParams($request)->array('users');

        // Check if user should only see their own statistics
        $show_own_stats_only = (bool) $this->getPreference('SHOW_OWN_STATS_ONLY', '0');
        if ($show_own_stats_only && Auth::check()) {
            $userIds = [$user->id()];
        }

        // Get initial data for page load (will be replaced by AJAX calls)
        $allUsers = $this->stats_service->getUsersWithChanges($tree);
        $treeStats = $this->stats_service->getChangesByTree($days, [], $userIds);

        // Get available years (for year filter checkboxes)
        $years_query = DB::table('change')
            ->where('gedcom_id', '=', $tree->id())
            ->select([DB::raw('YEAR(change_time) as year')])
            ->groupBy('year')
            ->orderByDesc('year')
            ->get();

        $availableYears = $years_query->map(function ($row) {
            return $row->year;
        })->all();

        $this->layout = 'layouts/default';
        $color_scheme = $this->getPreference('COLOR_SCHEME', 'modern');
        $timeline_display = $this->getPreference('TIMELINE_DISPLAY', 'skip_empty');

        return $this->viewResponse($this->name() . '::charts', [
            'title' => I18N::translate('Change Statistics'),
            'tree' => $tree,
            'days' => $days,
            'module' => $this->name(),
            'color_scheme' => $color_scheme,
            'timeline_display' => $timeline_display,
            'jsCommonUrl' => $this->assetUrl('js/lens-charts-common.js'),
            'jsDataUrl' => $this->assetUrl('js/lens-charts-data.js'),
            'jsEditorUrl' => $this->assetUrl('js/lens-charts-editor.js'),
            'jsHeatmapUrl' => $this->assetUrl('js/lens-charts-heatmap.js'),
            'jsActivityUrl' => $this->assetUrl('js/lens-charts-activity.js'),
            'allUsers' => $allUsers,
            'selectedUserIds' => $userIds,
            'availableYears' => $availableYears,
            'treeStats' => $treeStats,
        ]);
    }

    /**
     * AJAX endpoint for heatmap data
     *
     * @param ServerRequestInterface $request
     *
     * @return ResponseInterface
     */
    public function getHeatmapAjaxAction(ServerRequestInterface $request): ResponseInterface
    {
        $tree = Validator::attributes($request)->tree();
        $xDimension = Validator::queryParams($request)->string('x', 'hour');
        $yDimension = Validator::queryParams($request)->string('y', 'dayOfWeek');
        $measure = Validator::queryParams($request)->string('measure', 'changes');
        $userIds = Validator::queryParams($request)->array('users');
        $recordXrefs = Validator::queryParams($request)->array('records');
        $days = Validator::queryParams($request)->integer('days', 0);
        $years = Validator::queryParams($request)->array('years');

        $heatmapData = $this->stats_service->getHeatmapData(
            $tree,
            $xDimension,
            $yDimension,
            $measure,
            $userIds,
            $recordXrefs,
            $days,
            $years
        );

        try {
            $json = json_encode($heatmapData, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        } catch (\JsonException $e) {
            return response(json_encode(['error' => 'Failed to encode JSON data']))
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(500);
        }

        return response($json)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * AJAX endpoint for unified record search (TomSelect with optgroups)
     * Searches across all record types: INDI, FAM, SOUR, REPO, OBJE, NOTE, SUBM
     *
     * @param ServerRequestInterface $request
     *
     * @return ResponseInterface
     */
    public function getSearchAllRecordsAction(ServerRequestInterface $request): ResponseInterface
    {
        $tree = Validator::attributes($request)->tree();
        $query = Validator::queryParams($request)->string('query', '');
        $types = Validator::queryParams($request)->array('types');
        $limit = Validator::queryParams($request)->integer('limit', 50);

        // Minimum query length
        if (strlen($query) < 2) {
            return response(json_encode(['data' => []], JSON_UNESCAPED_UNICODE))
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $results = $this->stats_service->searchAllRecordTypes(
            $tree,
            $query,
            !empty($types) ? $types : null,
            min($limit, 100) // Cap at 100 results
        );

        return response(json_encode(['data' => $results], JSON_UNESCAPED_UNICODE))
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * UNIFIED DATA ENDPOINT - Replaces Charts, AdvancedAnalytics, ActivityLog
     * Serves data for all 3 tabs based on 'tab' parameter
     *
     * @param ServerRequestInterface $request
     *
     * @return ResponseInterface
     */
    public function getDataAction(ServerRequestInterface $request): ResponseInterface
    {
        try {
            $tree = Validator::attributes($request)->tree();
            $user = Validator::attributes($request)->user();

            // Check if authentication is required
            $require_authentication = (bool) $this->getPreference('REQUIRE_AUTHENTICATION', '0');
            if ($require_authentication && !Auth::check()) {
                throw new \Fisharebest\Webtrees\Http\Exceptions\HttpAccessDeniedException(
                    I18N::translate('You must be logged in to view statistics')
                );
            }

            // Check component access
            Auth::checkComponentAccess($this, ModuleChartInterface::class, $tree, $user);

            // Get filter parameters
            $tab = Validator::queryParams($request)->string('tab', 'content');

            // Get days parameter - must be nullable for mutual exclusion with years
            $queryParams = $request->getQueryParams();
            $days = isset($queryParams['days']) ? (int)$queryParams['days'] : null;

            $yearsParam = Validator::queryParams($request)->array('years');
            $years = array_map('intval', $yearsParam);  // Convert to integers
            $userIds = Validator::queryParams($request)->array('users');

            // Check if user should only see their own statistics
            $show_own_stats_only = (bool) $this->getPreference('SHOW_OWN_STATS_ONLY', '0');
            if ($show_own_stats_only && Auth::check()) {
                $userIds = [$user->id()];
            }

            $jsonData = [];
            switch ($tab) {
                case 'content':
                    // Tab 1: Data Content
                    $dataContentStats = $this->stats_service->getDataContentStats($tree, $days, $years, $userIds);
                    $factCompleteness = $this->stats_service->getFactCompletenessProgress($tree, 'month', $days, $years, $userIds);
                    $creationVsModification = $this->stats_service->getCreationVsModificationTrend($tree, 'month', $days, $years, $userIds);

                    $jsonData = [
                        'recordTypeStats' => $dataContentStats['recordTypeStats'],
                        'mostEditedIndividuals' => $dataContentStats['mostEditedIndividuals'],
                        'mostEditedFacts' => $dataContentStats['mostEditedFacts'],
                        'mostAddedFacts' => $dataContentStats['mostAddedFacts'],
                        'mostDeletedFacts' => $dataContentStats['mostDeletedFacts'],
                        'mostChangedFactsPerIndividual' => $dataContentStats['mostChangedFactsPerIndividual'],
                        'largestChanges' => $dataContentStats['largestChanges'],
                        'factCompleteness' => $factCompleteness,
                        'creationVsModification' => $creationVsModification,
                        'days' => $days,
                        'years' => $years,
                        'userCount' => count($userIds),
                    ];
                    break;

                case 'patterns':
                    // Tab 2: Work Patterns
                    $editorPatternsStats = $this->stats_service->getEditorPatternsStats($tree, $days, $years, $userIds);
                    $editingActivityOverTime = $this->stats_service->getEditingActivityOverTime($tree, $days, $years, $userIds);
                    $commitSizeDistribution = $this->stats_service->getCommitSizeDistribution($tree, $days, $years, $userIds);
                    $changeStatusStats = $this->stats_service->getChangeStatusStats($tree, $days, $years, $userIds);
                    $editVelocity = $this->stats_service->getEditVelocityTrend($tree, 'week', $days, $years, $userIds);
                    $sessionDuration = $this->stats_service->getSessionDurationDistribution($tree, $days, $years, $userIds);

                    $jsonData = [
                        'userStats' => $editorPatternsStats['userStats'],
                        'hourStats' => $editorPatternsStats['hourStats'],
                        'dayStats' => $editorPatternsStats['dayStats'],
                        'dayOfMonthStats' => $editorPatternsStats['dayOfMonthStats'],
                        'monthStats' => $editorPatternsStats['monthStats'],
                        'yearStats' => $editorPatternsStats['yearStats'],
                        'biggestWorkSessions' => $editorPatternsStats['biggestWorkSessions'],
                        'editingActivityOverTime' => $editingActivityOverTime,
                        'commitSizeDistribution' => $commitSizeDistribution,
                        'changeStatusStats' => $changeStatusStats,
                        'editVelocity' => $editVelocity,
                        'sessionDuration' => $sessionDuration,
                        'days' => $days,
                        'years' => $years,
                        'userCount' => count($userIds),
                    ];
                    break;

                case 'activity':
                    // Tab 4: Activity Log
                    // Support both days filter and years filter (mutual exclusion)
                    $authSummary = $this->stats_service->getAuthSummary($tree, 'day', $days, $years, $userIds);
                    $searchTimeline = $this->stats_service->getSearchTimeline($tree, 'day', $days, $years, $userIds);
                    $searchTerms = $this->stats_service->getSearchTermsFrequency($tree, $days, $years, 20, $userIds);
                    $failedLogins = $this->stats_service->getFailedLoginsList($tree, $days, $years, 1, 20, $userIds);
                    $messageTimeline = $this->stats_service->getMessageTimeline($tree, 'day', $days, $years, $userIds);
                    $userMessageStats = $this->stats_service->getUserMessageStats($tree, $days, $years, 15, $userIds);

                    // Apply IP masking based on admin preference
                    $maskIpAddress = $this->getPreference('MASK_IP_ADDRESS', 'hidden');
                    $failedLogins = $this->maskIpAddresses($failedLogins, $maskIpAddress);

                    $jsonData = [
                        'authSummary' => $authSummary,
                        'searchTimeline' => $searchTimeline,
                        'searchTerms' => $searchTerms,
                        'failedLogins' => $failedLogins,
                        'messageTimeline' => $messageTimeline,
                        'userMessageStats' => $userMessageStats,
                        'days' => $days,
                        'years' => $years,
                        'userCount' => count($userIds),
                    ];
                    break;

                default:
                    return response(json_encode(['error' => 'Unknown tab']))
                        ->withHeader('Content-Type', 'application/json')
                        ->withStatus(400);
            }

            // Encode response (inside try/catch to handle JsonException)
            $json = json_encode($jsonData, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);

            return response($json)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');

        } catch (\Throwable $e) {
            // Log error details server-side for debugging
            error_log(sprintf(
                'Insight Lens error: %s in %s:%d (%s)',
                $e->getMessage(),
                $e->getFile(),
                $e->getLine(),
                get_class($e)
            ));

            // Return generic error to client (no sensitive details)
            return response(json_encode([
                'error' => I18N::translate('An error occurred while loading data. Please try again.')
            ]))
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(500);
        }
    }

    /**
     * AJAX endpoint for record search (Select2)
     *
     * @param ServerRequestInterface $request
     *
     * @return ResponseInterface
     */
    public function searchRecordsAction(ServerRequestInterface $request): ResponseInterface
    {
        $tree = Validator::attributes($request)->tree();
        $query = Validator::queryParams($request)->string('q', '');
        $type = Validator::queryParams($request)->string('type', '');

        if (strlen($query) < 2) {
            try {
                $json = json_encode(['results' => []], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
            } catch (\JsonException $e) {
                return response(json_encode(['error' => 'Failed to encode JSON data']))
                    ->withHeader('Content-Type', 'application/json')
                    ->withStatus(500);
            }

            return response($json)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $results = $this->stats_service->searchRecords(
            $tree,
            $query,
            $type ?: null,
            20
        );

        try {
            $json = json_encode(['results' => $results], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        } catch (\JsonException $e) {
            return response(json_encode(['error' => 'Failed to encode JSON data']))
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(500);
        }

        return response($json)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * A page of configuration settings
     *
     * @param ServerRequestInterface $request
     *
     * @return ResponseInterface
     */
    public function getAdminAction(ServerRequestInterface $request): ResponseInterface
    {
        $this->layout = 'layouts/administration';

        $default_days = (int) $this->getPreference('DEFAULT_DAYS', '30');
        $color_scheme = $this->getPreference('COLOR_SCHEME', 'modern');
        $timeline_display = $this->getPreference('TIMELINE_DISPLAY', 'skip_empty');
        $require_authentication = (bool) $this->getPreference('REQUIRE_AUTHENTICATION', '0');
        $show_own_stats_only = (bool) $this->getPreference('SHOW_OWN_STATS_ONLY', '0');
        $mask_ip_address = $this->getPreference('MASK_IP_ADDRESS', 'hidden');

        return $this->viewResponse($this->name() . '::admin', [
            'title'                  => $this->title(),
            'module'                 => $this->name(),
            'default_days'           => $default_days,
            'color_scheme'           => $color_scheme,
            'timeline_display'       => $timeline_display,
            'require_authentication' => $require_authentication,
            'show_own_stats_only'    => $show_own_stats_only,
            'mask_ip_address'        => $mask_ip_address,
        ]);
    }

    /**
     * Save the user preferences
     *
     * @param ServerRequestInterface $request
     *
     * @return ResponseInterface
     */
    public function postAdminAction(ServerRequestInterface $request): ResponseInterface
    {
        $params = (array) $request->getParsedBody();

        // Validate default_days - check if numeric before casting
        $default_days_input = $params['default_days'] ?? 30;
        if (!is_numeric($default_days_input)) {
            $default_days = 30;
        } else {
            $default_days = (int) $default_days_input;
            // Validate bounds
            if ($default_days < 0) {
                $default_days = 30;
            }
            if ($default_days > 3650) {
                $default_days = 3650;
            }
        }

        $color_scheme = $params['color_scheme'] ?? 'modern';
        $timeline_display = $params['timeline_display'] ?? 'skip_empty';
        $require_authentication = isset($params['require_authentication']) ? '1' : '0';
        $show_own_stats_only = isset($params['show_own_stats_only']) ? '1' : '0';
        $mask_ip_address = $params['mask_ip_address'] ?? 'hidden';

        // Validate color_scheme
        if (!in_array($color_scheme, ['classic', 'modern'], true)) {
            $color_scheme = 'modern';
        }

        // Validate timeline_display
        if (!in_array($timeline_display, ['skip_empty', 'show_zeros'], true)) {
            $timeline_display = 'skip_empty';
        }

        // Validate mask_ip_address
        if (!in_array($mask_ip_address, ['hidden', 'partial', 'full'], true)) {
            $mask_ip_address = 'hidden';
        }

        $this->setPreference('DEFAULT_DAYS', (string) $default_days);
        $this->setPreference('COLOR_SCHEME', $color_scheme);
        $this->setPreference('TIMELINE_DISPLAY', $timeline_display);
        $this->setPreference('REQUIRE_AUTHENTICATION', $require_authentication);
        $this->setPreference('SHOW_OWN_STATS_ONLY', $show_own_stats_only);
        $this->setPreference('MASK_IP_ADDRESS', $mask_ip_address);

        $message = I18N::translate('The preferences for the module "%s" have been updated.', $this->title());
        \Fisharebest\Webtrees\FlashMessages::addMessage($message, 'success');

        return redirect($this->getConfigLink());
    }

    /**
     * Mask IP addresses based on admin preference
     *
     * @param array $failedLogins Array of failed login records
     * @param string $maskMode 'hidden', 'partial', or 'full'
     *
     * @return array Modified array with masked IP addresses
     */
    private function maskIpAddresses(array $failedLogins, string $maskMode): array
    {
        if ($maskMode === 'full') {
            // No masking needed
            return $failedLogins;
        }

        foreach ($failedLogins as &$entry) {
            if (!isset($entry['ip_address'])) {
                continue;
            }

            $ip = $entry['ip_address'];

            if ($maskMode === 'hidden') {
                // Completely hide IP address
                $entry['ip_address'] = '***.***.***';
            } elseif ($maskMode === 'partial') {
                // Partially mask: show first two octets for IPv4, first segment for IPv6
                if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                    // IPv4: 192.168.1.100 -> 192.168.xxx.xxx
                    $parts = explode('.', $ip);
                    if (count($parts) === 4) {
                        $entry['ip_address'] = $parts[0] . '.' . $parts[1] . '.xxx.xxx';
                    }
                } elseif (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
                    // IPv6: 2001:db8:85a3::8a2e:370:7334 -> 2001:db8:****:****
                    $parts = explode(':', $ip);
                    if (count($parts) >= 2) {
                        $entry['ip_address'] = $parts[0] . ':' . $parts[1] . ':****:****';
                    }
                } else {
                    // Unknown format - hide completely
                    $entry['ip_address'] = '***.***.***';
                }
            }
        }

        return $failedLogins;
    }

    /**
     * The person or organisation who created this module.
     *
     * @return string
     */
    public function customModuleAuthorName(): string
    {
        return 'Insight Lens';
    }

    /**
     * The version of this module.
     *
     * @return string
     */
    public function customModuleVersion(): string
    {
        return '1.0.0';
    }

    /**
     * A URL that will provide the latest version of this module.
     *
     * @return string
     */
    public function customModuleLatestVersionUrl(): string
    {
        return 'https://raw.githubusercontent.com/godzil3/webtrees-insight-lens/main/latest-version.txt';
    }

    /**
     * Where to get support for this module.  Perhaps a github repository?
     *
     * @return string
     */
    public function customModuleSupportUrl(): string
    {
        return 'https://github.com/godzil3/webtrees-insight-lens';
    }

    /**
     * Additional/updated translations.
     *
     * @param string $language
     *
     * @return array<string>
     */
    public function customTranslations(string $language): array
    {
        $languageFileMo = $this->resourcesFolder() . 'lang/' . $language . '.mo';
        $languageFilePo = $this->resourcesFolder() . 'lang/' . $language . '.po';
        $languageFileCsv = $this->resourcesFolder() . 'lang/' . $language . '.csv';

        $translations = [];

        // Load .mo file (compiled binary - fastest)
        if (file_exists($languageFileMo)) {
            try {
                $translations = (new Translation($languageFileMo))->asArray();
            } catch (\Exception $e) {
                // Log error and fall back to .po file if .mo is corrupted
                error_log(sprintf(
                    'Insight Lens: Failed to load .mo translation file %s: %s',
                    $languageFileMo,
                    $e->getMessage()
                ));
            }
        }

        // Load .po file (fallback if .mo doesn't exist or is corrupted)
        if (empty($translations) && file_exists($languageFilePo)) {
            $translations = $this->loadTranslationsFromPo($languageFilePo);
        }

        // Load .csv file (additional/override translations)
        if (file_exists($languageFileCsv)) {
            try {
                $translations = array_merge($translations, (new Translation($languageFileCsv))->asArray());
            } catch (\Exception $e) {
                // Log error but continue (CSV is optional)
                error_log(sprintf(
                    'Insight Lens: Failed to load .csv translation file %s: %s',
                    $languageFileCsv,
                    $e->getMessage()
                ));
            }
        }

        return $translations;
    }

    /**
     * Load translations from a .po file.
     *
     * @param string $filename
     *
     * @return array<string>
     */
    private function loadTranslationsFromPo(string $filename): array
    {
        $translations = [];
        $content = file_get_contents($filename);

        if ($content === false) {
            return [];
        }

        // Parse PO file - validate regex execution
        $matchCount = preg_match_all('/msgid\s+"(.+?)"\s*\nmsgstr\s+"(.+?)"/s', $content, $matches, PREG_SET_ORDER);

        if ($matchCount === false) {
            error_log(sprintf(
                'Insight Lens: Regex error parsing PO file %s: %s',
                $filename,
                preg_last_error_msg()
            ));
            return [];
        }

        foreach ($matches as $match) {
            // Validate match structure before accessing indices
            if (!isset($match[1], $match[2])) {
                continue;
            }

            $msgid = stripcslashes($match[1]);
            $msgstr = stripcslashes($match[2]);

            if ($msgid !== '' && $msgstr !== '') {
                $translations[$msgid] = $msgstr;
            }
        }

        return $translations;
    }
}
