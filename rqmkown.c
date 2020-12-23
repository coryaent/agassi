#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/types.h>

int main() {

    char * data_dir = getenv ("DATA_DIR");
    if (data_dir == NULL) {
        data_dir = "/data";
    };

	seteuid (0);
	setegid (0);

	if (!(mkdir(data_dir, 0755))) {
        chown(data_dir, getuid(), getgid());
    }

	exit (EXIT_SUCCESS);

}