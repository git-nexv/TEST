<?php
/**
 * Plugin Name: Full WP Backup (بکاپ کامل وردپرس)
 * Description: بکاپ کامل از تمام فایل‌ها و دیتابیس وردپرس (شامل ووکامرس، محصولات، سفارش‌ها، کاربران، تنظیمات، قالب‌ها، افزونه‌ها و رسانه‌ها) با امکان اکسپورت و ایمپورت.
 * Version: 1.0.0
 * Author: Full WP Backup
 * Requires PHP: 7.2
 * Text Domain: full-wp-backup
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FWB_Full_Backup {

	const SLUG = 'full-wp-backup';

	public function __construct() {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_post_fwb_export', array( $this, 'handle_export' ) );
		add_action( 'admin_post_fwb_download', array( $this, 'handle_download' ) );
		add_action( 'admin_post_fwb_delete', array( $this, 'handle_delete' ) );
		add_action( 'admin_post_fwb_import', array( $this, 'handle_import' ) );
	}

	/* ------------------------------------------------------------------ */
	/* Helpers                                                             */
	/* ------------------------------------------------------------------ */

	public static function backup_dir() {
		$dir = trailingslashit( WP_CONTENT_DIR ) . 'fwb-backups';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		if ( ! file_exists( $dir . '/.htaccess' ) ) {
			@file_put_contents( $dir . '/.htaccess', "Require all denied\nDeny from all\n" );
			@file_put_contents( $dir . '/index.php', "<?php // Silence\n" );
			@file_put_contents( $dir . '/web.config', '<configuration><system.webServer><authorization><deny users="*" /></authorization></system.webServer></configuration>' );
		}
		return $dir;
	}

	private function prepare_env() {
		@ignore_user_abort( true );
		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 0 );
		}
		@ini_set( 'memory_limit', '1024M' );
		wp_raise_memory_limit( 'admin' );
	}

	private function check_access( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'دسترسی غیرمجاز.' );
		}
		check_admin_referer( $action );
	}

	private function redirect( $type, $msg ) {
		set_transient( 'fwb_notice_' . get_current_user_id(), array( $type, $msg ), 300 );
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::SLUG ) );
		exit;
	}

	private function safe_name( $name ) {
		$name = basename( (string) $name );
		return preg_match( '/^[A-Za-z0-9._-]+\.zip$/', $name ) ? $name : '';
	}

	private function norm( $path ) {
		return rtrim( str_replace( '\\', '/', $path ), '/' );
	}

	/* ------------------------------------------------------------------ */
	/* Admin page                                                          */
	/* ------------------------------------------------------------------ */

	public function menu() {
		add_menu_page( 'بکاپ کامل', 'بکاپ کامل', 'manage_options', self::SLUG, array( $this, 'page' ), 'dashicons-backup', 80 );
	}

	public function page() {
		$notice = get_transient( 'fwb_notice_' . get_current_user_id() );
		if ( $notice ) {
			delete_transient( 'fwb_notice_' . get_current_user_id() );
		}
		$dir     = self::backup_dir();
		$files   = glob( $dir . '/*.zip' );
		$files   = $files ? $files : array();
		usort( $files, function ( $a, $b ) { return filemtime( $b ) - filemtime( $a ); } );
		$has_zip = class_exists( 'ZipArchive' );
		$max_up  = size_format( wp_max_upload_size() );
		?>
		<div class="wrap fwb" dir="rtl">
			<style>
				.fwb .fwb-grid{display:flex;gap:20px;flex-wrap:wrap;margin-top:20px}
				.fwb .fwb-card{background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:24px;flex:1;min-width:300px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
				.fwb .fwb-card h2{margin-top:0;font-size:20px}
				.fwb .button-hero{width:100%;text-align:center}
				.fwb table{margin-top:10px}
				.fwb .fwb-warn{color:#b32d2e}
				.fwb .fwb-loading{display:none;margin-top:10px;font-weight:bold}
			</style>
			<h1>بکاپ کامل وردپرس</h1>

			<?php if ( $notice ) : ?>
				<div class="notice notice-<?php echo esc_attr( $notice[0] ); ?> is-dismissible"><p><?php echo wp_kses_post( $notice[1] ); ?></p></div>
			<?php endif; ?>

			<?php if ( ! $has_zip ) : ?>
				<div class="notice notice-error"><p>افزونه PHP به نام <code>ZipArchive</code> روی هاست شما فعال نیست. از پشتیبانی هاست بخواهید آن را فعال کنند.</p></div>
			<?php endif; ?>

			<div class="fwb-grid">
				<div class="fwb-card">
					<h2>⬇️ اکسپورت (گرفتن بکاپ)</h2>
					<p>از <strong>تمام فایل‌های وردپرس</strong> (هسته، قالب‌ها، افزونه‌ها، رسانه‌ها و ...) و <strong>کل دیتابیس</strong> (محصولات، سفارش‌ها، مشتری‌ها، کاربران، تنظیمات و ...) یک فایل ZIP ساخته و دانلود می‌شود.</p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="fwb-form">
						<?php wp_nonce_field( 'fwb_export' ); ?>
						<input type="hidden" name="action" value="fwb_export">
						<button class="button button-primary button-hero" <?php disabled( ! $has_zip ); ?>>اکسپورت</button>
						<div class="fwb-loading">در حال ساخت بکاپ... لطفاً صفحه را نبندید (بسته به حجم سایت ممکن است چند دقیقه طول بکشد).</div>
					</form>
				</div>

				<div class="fwb-card">
					<h2>⬆️ ایمپورت (بازگردانی بکاپ)</h2>
					<p>فایل ZIP بکاپی که با همین افزونه گرفته‌اید را انتخاب کنید. <span class="fwb-warn">تمام اطلاعات فعلی سایت با بکاپ جایگزین می‌شود.</span></p>
					<form method="post" enctype="multipart/form-data" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="fwb-form fwb-import">
						<?php wp_nonce_field( 'fwb_import' ); ?>
						<input type="hidden" name="action" value="fwb_import">
						<p><input type="file" name="fwb_file" accept=".zip"></p>
						<p class="description">حداکثر حجم آپلود هاست: <?php echo esc_html( $max_up ); ?>. اگر بکاپ بزرگ‌تر است، آن را با FTP / فایل‌منیجر در پوشه <code>wp-content/fwb-backups</code> قرار دهید و از جدول پایین «بازگردانی» را بزنید.</p>
						<button class="button button-primary button-hero" <?php disabled( ! $has_zip ); ?>>ایمپورت</button>
						<div class="fwb-loading">در حال بازگردانی... لطفاً صفحه را نبندید.</div>
					</form>
				</div>
			</div>

			<div class="fwb-card" style="margin-top:20px">
				<h2>بکاپ‌های موجود روی سرور</h2>
				<?php if ( ! $files ) : ?>
					<p>هنوز بکاپی وجود ندارد.</p>
				<?php else : ?>
					<table class="widefat striped">
						<thead><tr><th>نام فایل</th><th>حجم</th><th>تاریخ</th><th>عملیات</th></tr></thead>
						<tbody>
						<?php foreach ( $files as $f ) :
							$n = basename( $f ); ?>
							<tr>
								<td><?php echo esc_html( $n ); ?></td>
								<td><?php echo esc_html( size_format( filesize( $f ), 1 ) ); ?></td>
								<td><?php echo esc_html( wp_date( 'Y-m-d H:i', filemtime( $f ) ) ); ?></td>
								<td>
									<a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=fwb_download&file=' . rawurlencode( $n ) ), 'fwb_download' ) ); ?>">دانلود</a>
									<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline" class="fwb-form fwb-import">
										<?php wp_nonce_field( 'fwb_import' ); ?>
										<input type="hidden" name="action" value="fwb_import">
										<input type="hidden" name="existing" value="<?php echo esc_attr( $n ); ?>">
										<button class="button">بازگردانی</button>
									</form>
									<a class="button fwb-del" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=fwb_delete&file=' . rawurlencode( $n ) ), 'fwb_delete' ) ); ?>">حذف</a>
								</td>
							</tr>
						<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
			</div>
			<script>
				document.querySelectorAll('.fwb-form').forEach(function(f){
					f.addEventListener('submit',function(e){
						if(f.classList.contains('fwb-import') && !confirm('تمام اطلاعات فعلی سایت (فایل‌ها و دیتابیس) با بکاپ جایگزین می‌شود. ادامه می‌دهید؟')){e.preventDefault();return;}
						var l=f.querySelector('.fwb-loading'); if(l) l.style.display='block';
						f.querySelectorAll('button').forEach(function(b){b.disabled=true;});
					});
				});
				document.querySelectorAll('.fwb-del').forEach(function(a){
					a.addEventListener('click',function(e){ if(!confirm('این بکاپ حذف شود؟')) e.preventDefault(); });
				});
			</script>
		</div>
		<?php
	}

	/* ------------------------------------------------------------------ */
	/* Export                                                              */
	/* ------------------------------------------------------------------ */

	public function handle_export() {
		$this->check_access( 'fwb_export' );
		$this->prepare_env();

		if ( ! class_exists( 'ZipArchive' ) ) {
			$this->redirect( 'error', 'ZipArchive روی سرور فعال نیست.' );
		}

		$dir   = self::backup_dir();
		$host  = preg_replace( '/[^A-Za-z0-9.-]/', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		$name  = 'backup-' . $host . '-' . gmdate( 'Y-m-d-His' ) . '-' . wp_generate_password( 6, false ) . '.zip';
		$zip_p = $dir . '/' . $name;
		$sql_p = $dir . '/db-' . wp_generate_password( 12, false ) . '.sql';

		try {
			$this->dump_database( $sql_p );

			$zip = new ZipArchive();
			if ( true !== $zip->open( $zip_p, ZipArchive::CREATE | ZipArchive::OVERWRITE ) ) {
				throw new Exception( 'ساخت فایل ZIP ممکن نشد.' );
			}

			global $wpdb;
			$manifest = array(
				'plugin'     => 'full-wp-backup',
				'version'    => '1.0.0',
				'created'    => gmdate( 'c' ),
				'home'       => get_option( 'home' ),
				'siteurl'    => get_option( 'siteurl' ),
				'abspath'    => $this->norm( ABSPATH ),
				'prefix'     => $wpdb->prefix,
				'wp_version' => get_bloginfo( 'version' ),
			);
			$zip->addFromString( 'manifest.json', wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) );
			$zip->addFile( $sql_p, 'database.sql' );

			$this->add_files( $zip, $dir );

			if ( ! $zip->close() ) {
				throw new Exception( 'بستن فایل ZIP با خطا مواجه شد (احتمالاً فضای هاست کافی نیست).' );
			}
		} catch ( Exception $e ) {
			@unlink( $sql_p );
			@unlink( $zip_p );
			$this->redirect( 'error', 'خطا در ساخت بکاپ: ' . esc_html( $e->getMessage() ) );
		}
		@unlink( $sql_p );

		$this->stream_file( $zip_p );
	}

	private function add_files( ZipArchive $zip, $exclude_dir ) {
		$root    = $this->norm( ABSPATH );
		$exclude = $this->norm( $exclude_dir );
		$it      = new RecursiveIteratorIterator(
			new RecursiveCallbackFilterIterator(
				new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS | FilesystemIterator::UNIX_PATHS ),
				function ( $file ) use ( $exclude ) {
					$p = $this->norm( $file->getPathname() );
					if ( $p === $exclude || 0 === strpos( $p, $exclude . '/' ) ) {
						return false;
					}
					if ( $file->isLink() ) {
						return false;
					}
					return $file->isReadable();
				}
			),
			RecursiveIteratorIterator::SELF_FIRST,
			RecursiveIteratorIterator::CATCH_GET_CHILD
		);

		foreach ( $it as $file ) {
			$p   = $this->norm( $file->getPathname() );
			$rel = 'files/' . ltrim( substr( $p, strlen( $root ) ), '/' );
			if ( $file->isDir() ) {
				$zip->addEmptyDir( $rel );
			} elseif ( $file->isFile() ) {
				$zip->addFile( $p, $rel );
			}
		}
	}

	private function backup_tables() {
		global $wpdb;
		$like   = $wpdb->esc_like( $wpdb->base_prefix ) . '%';
		$out    = array();
		$rows   = $wpdb->get_results( $wpdb->prepare( 'SHOW FULL TABLES LIKE %s', $like ), ARRAY_N );
		foreach ( (array) $rows as $r ) {
			$out[ $r[0] ] = isset( $r[1] ) ? $r[1] : 'BASE TABLE';
		}
		return $out;
	}

	private function esc_value( $v ) {
		global $wpdb;
		if ( null === $v ) {
			return 'NULL';
		}
		if ( $wpdb->dbh instanceof mysqli ) {
			return "'" . mysqli_real_escape_string( $wpdb->dbh, $v ) . "'";
		}
		return "'" . $wpdb->remove_placeholder_escape( esc_sql( $v ) ) . "'";
	}

	private function dump_database( $path ) {
		global $wpdb;
		$fh = fopen( $path, 'wb' );
		if ( ! $fh ) {
			throw new Exception( 'نوشتن فایل دیتابیس ممکن نشد.' );
		}
		fwrite( $fh, "-- Full WP Backup SQL dump\n" );
		fwrite( $fh, "SET NAMES " . ( $wpdb->charset ? $wpdb->charset : 'utf8mb4' ) . ";\n" );
		fwrite( $fh, "SET FOREIGN_KEY_CHECKS=0;\n" );
		fwrite( $fh, "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n" );

		$tables = $this->backup_tables();
		$views  = array();

		foreach ( $tables as $table => $type ) {
			if ( 'VIEW' === $type ) {
				$views[] = $table;
				continue;
			}
			$create = $wpdb->get_row( "SHOW CREATE TABLE `{$table}`", ARRAY_N );
			if ( ! $create ) {
				continue;
			}
			fwrite( $fh, "\n-- TABLE {$table}\n" );
			fwrite( $fh, "DROP TABLE IF EXISTS `{$table}`;\n" );
			fwrite( $fh, str_replace( array( "\r", "\n" ), ' ', $create[1] ) . ";\n" );

			$offset = 0;
			$batch  = 500;
			do {
				$rows = $wpdb->get_results( "SELECT * FROM `{$table}` LIMIT {$offset}, {$batch}", ARRAY_A );
				if ( $wpdb->last_error ) {
					throw new Exception( $wpdb->last_error );
				}
				if ( $rows ) {
					$cols   = '`' . implode( '`,`', array_keys( $rows[0] ) ) . '`';
					$values = array();
					foreach ( $rows as $row ) {
						$values[] = '(' . implode( ',', array_map( array( $this, 'esc_value' ), array_values( $row ) ) ) . ')';
					}
					// Write in groups so a single line never gets huge.
					foreach ( array_chunk( $values, 50 ) as $chunk ) {
						fwrite( $fh, "INSERT INTO `{$table}` ({$cols}) VALUES " . implode( ',', $chunk ) . ";\n" );
					}
				}
				$offset += $batch;
			} while ( $rows && count( $rows ) === $batch );
		}

		foreach ( $views as $view ) {
			$create = $wpdb->get_row( "SHOW CREATE VIEW `{$view}`", ARRAY_N );
			if ( $create ) {
				$sql = preg_replace( '/DEFINER=`[^`]+`@`[^`]+`\s*/', '', $create[1] );
				fwrite( $fh, "DROP VIEW IF EXISTS `{$view}`;\n" . str_replace( array( "\r", "\n" ), ' ', $sql ) . ";\n" );
			}
		}

		fwrite( $fh, "SET FOREIGN_KEY_CHECKS=1;\n" );
		fclose( $fh );
	}

	private function stream_file( $path ) {
		while ( ob_get_level() ) {
			ob_end_clean();
		}
		nocache_headers();
		header( 'Content-Type: application/zip' );
		header( 'Content-Disposition: attachment; filename="' . basename( $path ) . '"' );
		header( 'Content-Length: ' . filesize( $path ) );
		header( 'X-Content-Type-Options: nosniff' );
		$fh = fopen( $path, 'rb' );
		while ( ! feof( $fh ) ) {
			echo fread( $fh, 1024 * 1024 ); // phpcs:ignore
			flush();
		}
		fclose( $fh );
		exit;
	}

	public function handle_download() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'دسترسی غیرمجاز.' );
		}
		check_admin_referer( 'fwb_download' );
		$name = $this->safe_name( isset( $_GET['file'] ) ? wp_unslash( $_GET['file'] ) : '' );
		$path = self::backup_dir() . '/' . $name;
		if ( ! $name || ! is_file( $path ) ) {
			wp_die( 'فایل پیدا نشد.' );
		}
		$this->prepare_env();
		$this->stream_file( $path );
	}

	public function handle_delete() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'دسترسی غیرمجاز.' );
		}
		check_admin_referer( 'fwb_delete' );
		$name = $this->safe_name( isset( $_GET['file'] ) ? wp_unslash( $_GET['file'] ) : '' );
		if ( $name && is_file( self::backup_dir() . '/' . $name ) ) {
			unlink( self::backup_dir() . '/' . $name );
			$this->redirect( 'success', 'بکاپ حذف شد.' );
		}
		$this->redirect( 'error', 'فایل پیدا نشد.' );
	}

	/* ------------------------------------------------------------------ */
	/* Import                                                              */
	/* ------------------------------------------------------------------ */

	public function handle_import() {
		$this->check_access( 'fwb_import' );
		$this->prepare_env();

		if ( ! class_exists( 'ZipArchive' ) ) {
			$this->redirect( 'error', 'ZipArchive روی سرور فعال نیست.' );
		}

		$dir = self::backup_dir();

		if ( ! empty( $_POST['existing'] ) ) {
			$name = $this->safe_name( wp_unslash( $_POST['existing'] ) );
			$zip_p = $dir . '/' . $name;
			if ( ! $name || ! is_file( $zip_p ) ) {
				$this->redirect( 'error', 'فایل بکاپ پیدا نشد.' );
			}
		} else {
			if ( empty( $_FILES['fwb_file'] ) || UPLOAD_ERR_OK !== $_FILES['fwb_file']['error'] ) {
				$err = isset( $_FILES['fwb_file']['error'] ) ? (int) $_FILES['fwb_file']['error'] : -1;
				$msg = in_array( $err, array( UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE ), true )
					? 'حجم فایل از حد مجاز آپلود هاست بیشتر است. فایل را با FTP در پوشه wp-content/fwb-backups بگذارید و از جدول «بازگردانی» را بزنید.'
					: 'فایلی آپلود نشد.';
				$this->redirect( 'error', $msg );
			}
			$orig = sanitize_file_name( wp_unslash( $_FILES['fwb_file']['name'] ) );
			if ( ! preg_match( '/\.zip$/i', $orig ) ) {
				$this->redirect( 'error', 'فقط فایل ZIP مجاز است.' );
			}
			$zip_p = $dir . '/uploaded-' . gmdate( 'Y-m-d-His' ) . '-' . wp_generate_password( 6, false ) . '.zip';
			if ( ! move_uploaded_file( $_FILES['fwb_file']['tmp_name'], $zip_p ) ) {
				$this->redirect( 'error', 'انتقال فایل آپلود شده ممکن نشد.' );
			}
		}

		$zip = new ZipArchive();
		if ( true !== $zip->open( $zip_p ) ) {
			$this->redirect( 'error', 'فایل ZIP معتبر نیست.' );
		}
		$manifest = json_decode( (string) $zip->getFromName( 'manifest.json' ), true );
		if ( ! is_array( $manifest ) || empty( $manifest['plugin'] ) || 'full-wp-backup' !== $manifest['plugin'] || false === $zip->locateName( 'database.sql' ) ) {
			$zip->close();
			$this->redirect( 'error', 'این فایل، بکاپ ساخته‌شده با این افزونه نیست.' );
		}

		// Keep current DB credentials & URLs so the site keeps working after restore.
		global $wpdb;
		$new_home    = get_option( 'home' );
		$new_siteurl = get_option( 'siteurl' );
		$new_prefix  = $wpdb->prefix;
		$new_root    = $this->norm( ABSPATH );

		try {
			// 1) Files
			$this->restore_files( $zip, $dir );

			// 2) Database
			$tmp_sql = $dir . '/restore-' . wp_generate_password( 12, false ) . '.sql';
			$in      = $zip->getStream( 'database.sql' );
			$out     = fopen( $tmp_sql, 'wb' );
			if ( ! $in || ! $out ) {
				throw new Exception( 'خواندن دیتابیس از بکاپ ممکن نشد.' );
			}
			stream_copy_to_stream( $in, $out );
			fclose( $in );
			fclose( $out );
			$zip->close();

			$this->import_sql( $tmp_sql );
			@unlink( $tmp_sql );

			// 3) Table prefix migration
			$old_prefix = isset( $manifest['prefix'] ) ? $manifest['prefix'] : $new_prefix;
			if ( $old_prefix !== $new_prefix ) {
				$this->change_prefix( $old_prefix, $new_prefix );
			}

			// 4) URL / path migration (serialized-safe)
			$pairs = array();
			if ( ! empty( $manifest['home'] ) && untrailingslashit( $manifest['home'] ) !== untrailingslashit( $new_home ) ) {
				$pairs[ untrailingslashit( $manifest['home'] ) ] = untrailingslashit( $new_home );
			}
			if ( ! empty( $manifest['siteurl'] ) && untrailingslashit( $manifest['siteurl'] ) !== untrailingslashit( $new_siteurl ) ) {
				$pairs[ untrailingslashit( $manifest['siteurl'] ) ] = untrailingslashit( $new_siteurl );
			}
			if ( ! empty( $manifest['abspath'] ) && $manifest['abspath'] !== $new_root ) {
				$pairs[ $manifest['abspath'] ] = $new_root;
			}
			if ( $pairs ) {
				$this->search_replace( $pairs, $new_prefix );
				$wpdb->query( $wpdb->prepare( "UPDATE `{$new_prefix}options` SET option_value=%s WHERE option_name='home'", $new_home ) );
				$wpdb->query( $wpdb->prepare( "UPDATE `{$new_prefix}options` SET option_value=%s WHERE option_name='siteurl'", $new_siteurl ) );
			}

			// Make sure this plugin stays active after restore.
			wp_cache_flush();
			$active = maybe_unserialize( (string) $wpdb->get_var( "SELECT option_value FROM `{$new_prefix}options` WHERE option_name='active_plugins'" ) );
			$me     = plugin_basename( __FILE__ );
			if ( is_array( $active ) && ! in_array( $me, $active, true ) ) {
				$active[] = $me;
				$wpdb->update( "{$new_prefix}options", array( 'option_value' => maybe_serialize( $active ) ), array( 'option_name' => 'active_plugins' ) );
			}
			$wpdb->query( "DELETE FROM `{$new_prefix}options` WHERE option_name LIKE '\\_transient\\_%' OR option_name LIKE '\\_site\\_transient\\_%'" );
		} catch ( Exception $e ) {
			$this->redirect( 'error', 'خطا در بازگردانی: ' . esc_html( $e->getMessage() ) );
		}

		wp_cache_flush();
		if ( function_exists( 'opcache_reset' ) ) {
			@opcache_reset();
		}

		// Users/sessions were replaced by the backup, so the user must log in again.
		wp_clear_auth_cookie();
		wp_die(
			'<div dir="rtl" style="font-family:tahoma"><h2>✅ بازگردانی بکاپ با موفقیت انجام شد.</h2><p>اطلاعات کاربران هم بازگردانی شده است؛ لطفاً با نام کاربری و رمز عبور <strong>سایت بکاپ‌گرفته‌شده</strong> وارد شوید.</p><p><a class="button" href="' . esc_url( wp_login_url( admin_url() ) ) . '">ورود به پیشخوان</a></p><p>بعد از ورود، یک‌بار به «تنظیمات ← پیوندهای یکتا» بروید و «ذخیره» را بزنید.</p></div>',
			'بازگردانی انجام شد',
			array( 'response' => 200 )
		);
	}

	private function restore_files( ZipArchive $zip, $backup_dir ) {
		$root    = $this->norm( ABSPATH );
		$exclude = $this->norm( $backup_dir );
		$skip    = array( 'wp-config.php' ); // keep current DB credentials

		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			$name = $zip->getNameIndex( $i );
			if ( 0 !== strpos( $name, 'files/' ) ) {
				continue;
			}
			$rel = substr( $name, 6 );
			if ( '' === $rel || false !== strpos( $rel, '..' ) || in_array( rtrim( $rel, '/' ), $skip, true ) ) {
				continue;
			}
			$target = $root . '/' . $rel;
			$t_norm = $this->norm( $target );
			if ( $t_norm === $exclude || 0 === strpos( $t_norm, $exclude . '/' ) ) {
				continue;
			}
			if ( '/' === substr( $name, -1 ) ) {
				wp_mkdir_p( $target );
				continue;
			}
			wp_mkdir_p( dirname( $target ) );
			$in = $zip->getStream( $name );
			if ( ! $in ) {
				continue;
			}
			$out = @fopen( $target, 'wb' );
			if ( $out ) {
				stream_copy_to_stream( $in, $out );
				fclose( $out );
			}
			fclose( $in );
		}
	}

	private function import_sql( $path ) {
		global $wpdb;
		$fh = fopen( $path, 'rb' );
		if ( ! $fh ) {
			throw new Exception( 'باز کردن فایل SQL ممکن نشد.' );
		}
		$wpdb->query( 'SET FOREIGN_KEY_CHECKS=0' );
		$buffer = '';
		$errors = array();
		while ( false !== ( $line = fgets( $fh ) ) ) {
			if ( '' === $buffer && ( 0 === strpos( $line, '--' ) || '' === trim( $line ) ) ) {
				continue;
			}
			$buffer .= $line;
			if ( ";\n" === substr( $buffer, -2 ) || ";\r\n" === substr( $buffer, -3 ) ) {
				$q = rtrim( trim( $buffer ), ';' );
				$buffer = '';
				if ( false === $wpdb->query( $q ) && $wpdb->last_error ) {
					$errors[] = $wpdb->last_error;
				}
			}
		}
		fclose( $fh );
		$wpdb->query( 'SET FOREIGN_KEY_CHECKS=1' );
		if ( count( $errors ) > 20 ) {
			throw new Exception( 'خطاهای زیاد در ایمپورت دیتابیس: ' . implode( ' | ', array_slice( $errors, 0, 3 ) ) );
		}
	}

	private function change_prefix( $old, $new ) {
		global $wpdb;
		$tables = $wpdb->get_col( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $old ) . '%' ) );
		foreach ( $tables as $t ) {
			$nt = $new . substr( $t, strlen( $old ) );
			$wpdb->query( "DROP TABLE IF EXISTS `{$nt}`" );
			$wpdb->query( "RENAME TABLE `{$t}` TO `{$nt}`" );
		}
		$like = $wpdb->esc_like( $old ) . '%';
		$wpdb->query( $wpdb->prepare( "UPDATE `{$new}options` SET option_name = CONCAT(%s, SUBSTRING(option_name, %d)) WHERE option_name LIKE %s", $new, strlen( $old ) + 1, $like ) );
		$wpdb->query( $wpdb->prepare( "UPDATE `{$new}usermeta` SET meta_key = CONCAT(%s, SUBSTRING(meta_key, %d)) WHERE meta_key LIKE %s", $new, strlen( $old ) + 1, $like ) );
	}

	private function replace_deep( $data, $pairs ) {
		if ( is_string( $data ) ) {
			if ( is_serialized( $data ) ) {
				$u = @unserialize( $data, array( 'allowed_classes' => false ) );
				if ( false !== $u || 'b:0;' === $data ) {
					return serialize( $this->replace_deep( $u, $pairs ) );
				}
			}
			return strtr( $data, $pairs );
		}
		if ( is_array( $data ) ) {
			foreach ( $data as $k => $v ) {
				$data[ $k ] = $this->replace_deep( $v, $pairs );
			}
		} elseif ( is_object( $data ) && ! ( $data instanceof __PHP_Incomplete_Class ) ) {
			foreach ( get_object_vars( $data ) as $k => $v ) {
				$data->$k = $this->replace_deep( $v, $pairs );
			}
		}
		return $data;
	}

	private function search_replace( $pairs, $prefix ) {
		global $wpdb;
		$tables = $wpdb->get_col( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $prefix ) . '%' ) );
		foreach ( $tables as $table ) {
			$cols = $wpdb->get_results( "SHOW COLUMNS FROM `{$table}`", ARRAY_A );
			$pk   = array();
			$text = array();
			foreach ( $cols as $c ) {
				if ( 'PRI' === $c['Key'] ) {
					$pk[] = $c['Field'];
				}
				if ( preg_match( '/char|text|blob|json/i', $c['Type'] ) ) {
					$text[] = $c['Field'];
				}
			}
			if ( ! $pk || ! $text ) {
				continue;
			}
			foreach ( $text as $col ) {
				$where = array();
				foreach ( array_keys( $pairs ) as $from ) {
					$where[] = $wpdb->prepare( "`{$col}` LIKE %s", '%' . $wpdb->esc_like( $from ) . '%' );
				}
				$sel  = '`' . implode( '`,`', $pk ) . '`';
				$rows = $wpdb->get_results( "SELECT {$sel}, `{$col}` AS fwb_val FROM `{$table}` WHERE " . implode( ' OR ', $where ), ARRAY_A );
				foreach ( (array) $rows as $row ) {
					$new = $this->replace_deep( $row['fwb_val'], $pairs );
					if ( $new !== $row['fwb_val'] ) {
						$cond = array();
						foreach ( $pk as $k ) {
							$cond[ $k ] = $row[ $k ];
						}
						$wpdb->update( $table, array( $col => $new ), $cond );
					}
				}
			}
		}
	}
}

new FWB_Full_Backup();
